import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getRole, canRead, canEdit, canManage, ROLES } from './access.js';
import { cleanHtml } from './sanitize.js';
import { importFile, UnsupportedFileError, SUPPORTED_EXTENSIONS } from './importers.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_TITLE = 120;
const MAX_CONTENT = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const now = () => new Date().toISOString();

function validateTitle(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'Title must be text.');
  const title = value.trim();
  if (!title) throw new HttpError(400, 'Title cannot be empty.');
  if (title.length > MAX_TITLE) throw new HttpError(400, `Title must be ${MAX_TITLE} characters or fewer.`);
  return title;
}

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '3mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  // ---------- auth (mocked: pick a seeded user, receive a bearer token) ----------
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/users', (_req, res) => {
    res.json(db.prepare('SELECT id, name, email FROM users ORDER BY name').all());
  });

  app.post('/api/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
    if (!user) throw new HttpError(401, 'No account for that email. Pick one of the demo users.');
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, user.id, now());
    res.json({ token, user });
  });

  const requireUser = (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = token
      ? db.prepare(`SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token)
      : null;
    if (!user) throw new HttpError(401, 'Please sign in.');
    req.user = user;
    next();
  };

  app.get('/api/me', requireUser, (req, res) => res.json(req.user));
  app.post('/api/logout', requireUser, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.get('authorization').slice(7));
    res.status(204).end();
  });

  // ---------- documents ----------
  const summaryRow = `d.id, d.title, d.updated_at, d.created_at, d.owner_id, o.name AS owner_name`;

  app.get('/api/documents', requireUser, (req, res) => {
    const owned = db
      .prepare(`SELECT ${summaryRow} FROM documents d JOIN users o ON o.id = d.owner_id
                WHERE d.owner_id = ? ORDER BY d.updated_at DESC`)
      .all(req.user.id);
    const shared = db
      .prepare(`SELECT ${summaryRow}, s.role FROM shares s
                JOIN documents d ON d.id = s.document_id JOIN users o ON o.id = d.owner_id
                WHERE s.user_id = ? ORDER BY d.updated_at DESC`)
      .all(req.user.id);
    res.json({ owned, shared });
  });

  app.post('/api/documents', requireUser, (req, res) => {
    const title = req.body?.title === undefined ? 'Untitled document' : validateTitle(req.body.title);
    const id = crypto.randomUUID();
    const ts = now();
    db.prepare('INSERT INTO documents (id, owner_id, title, content, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(id, req.user.id, title, '', ts, ts);
    res.status(201).json(loadDocument(id, req.user.id));
  });

  function loadDocument(id, userId) {
    const role = getRole(db, id, userId);
    if (!canRead(role)) return null;
    const doc = db
      .prepare(`SELECT d.id, d.title, d.content, d.created_at, d.updated_at, d.owner_id, o.name AS owner_name
                FROM documents d JOIN users o ON o.id = d.owner_id WHERE d.id = ?`)
      .get(id);
    return { ...doc, role };
  }

  // Missing docs and docs you cannot see both return 404 so existence is not leaked.
  const withAccess = (check, denyStatus = 403, denyMessage = 'You do not have permission to do that.') =>
    (req, _res, next) => {
      const role = getRole(db, req.params.id, req.user.id);
      if (!canRead(role)) throw new HttpError(404, 'Document not found.');
      if (!check(role)) throw new HttpError(denyStatus, denyMessage);
      req.role = role;
      next();
    };

  app.post('/api/documents/import', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, `Choose a file to import (${SUPPORTED_EXTENSIONS.join(', ')}).`);
    if (req.file.size === 0) throw new HttpError(400, 'That file is empty.');
    let imported;
    try {
      imported = await importFile({ originalname: req.file.originalname, buffer: req.file.buffer });
    } catch (err) {
      if (err instanceof UnsupportedFileError) throw new HttpError(415, err.message);
      throw new HttpError(422, 'Could not read that file. Check that it is a valid document and try again.');
    }
    const id = crypto.randomUUID();
    const ts = now();
    db.prepare('INSERT INTO documents (id, owner_id, title, content, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(id, req.user.id, imported.title, imported.html, ts, ts);
    res.status(201).json(loadDocument(id, req.user.id));
  });

  app.get('/api/documents/:id', requireUser, withAccess(canRead), (req, res) => {
    res.json(loadDocument(req.params.id, req.user.id));
  });

  app.patch('/api/documents/:id', requireUser, withAccess(canEdit, 403, 'You have view-only access to this document.'), (req, res) => {
    const { title, content } = req.body ?? {};
    if (title === undefined && content === undefined) throw new HttpError(400, 'Nothing to update.');
    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(validateTitle(title)); }
    if (content !== undefined) {
      if (typeof content !== 'string') throw new HttpError(400, 'Content must be HTML text.');
      if (content.length > MAX_CONTENT) throw new HttpError(413, 'Document is too large to save.');
      fields.push('content = ?'); values.push(cleanHtml(content));
    }
    fields.push('updated_at = ?'); values.push(now());
    db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`).run(...values, req.params.id);
    res.json(loadDocument(req.params.id, req.user.id));
  });

  app.delete('/api/documents/:id', requireUser, withAccess(canManage, 403, 'Only the owner can delete a document.'), (req, res) => {
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  // ---------- sharing ----------
  const listShares = (docId) =>
    db.prepare(`SELECT u.id AS user_id, u.name, u.email, s.role FROM shares s
                JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`).all(docId);

  app.get('/api/documents/:id/shares', requireUser, withAccess(canRead), (req, res) => {
    res.json(listShares(req.params.id));
  });

  app.put('/api/documents/:id/shares', requireUser, withAccess(canManage, 403, 'Only the owner can change sharing.'), (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const role = req.body?.role ?? 'viewer';
    if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}.`);
    if (!email) throw new HttpError(400, 'Enter the email of the person to share with.');
    const target = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!target) throw new HttpError(404, 'No user with that email.');
    if (target.id === req.user.id) throw new HttpError(400, 'You already own this document.');
    db.prepare(`INSERT INTO shares (document_id, user_id, role, created_at) VALUES (?,?,?,?)
                ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`)
      .run(req.params.id, target.id, role, now());
    res.json(listShares(req.params.id));
  });

  app.delete('/api/documents/:id/shares/:userId', requireUser, withAccess(canManage, 403, 'Only the owner can change sharing.'), (req, res) => {
    db.prepare('DELETE FROM shares WHERE document_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
    res.json(listShares(req.params.id));
  });

  // ---------- static client (production) ----------
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
        : 'Upload failed. Try a single file.';
      return res.status(400).json({ error: message });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Try again.' : err.message });
  });

  return app;
}
