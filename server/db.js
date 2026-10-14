import { DatabaseSync } from 'node:sqlite'; // built into Node 22.5+, no native build needed
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SEED_USERS = [
  { id: 'u_asha', name: 'Asha Verma', email: 'asha@ajaia.test' },
  { id: 'u_ben', name: 'Ben Carter', email: 'ben@ajaia.test' },
  { id: 'u_chen', name: 'Chen Li', email: 'chen@ajaia.test' },
  { id: 'u_dana', name: 'Dana Okafor', email: 'dana@ajaia.test' },
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('viewer','editor')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_docs_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
`;

const WELCOME_HTML = `<h1>Welcome to Ajaia Docs</h1>
<p>This is a seeded document owned by <strong>Asha</strong>. It is shared with Ben as an <em>editor</em> and with Chen as a <u>viewer</u>, so you can see how sharing works by switching users.</p>
<h2>Try it</h2>
<ul><li>Select text and use the toolbar for bold, italic, underline.</li><li>Switch headings and lists from the toolbar.</li><li>Import a .txt, .md or .docx file from the sidebar.</li></ul>
<ol><li>Changes save automatically.</li><li>Refresh the page — everything is still here.</li></ol>`;

export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)');
  for (const u of SEED_USERS) insertUser.run(u.id, u.name, u.email);

  const hasDocs = db.prepare('SELECT COUNT(*) AS n FROM documents').get().n > 0;
  if (hasDocs) return;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO documents (id, owner_id, title, content, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(id, 'u_asha', 'Welcome to Ajaia Docs', WELCOME_HTML, now, now);
  const share = db.prepare('INSERT INTO shares (document_id, user_id, role, created_at) VALUES (?,?,?,?)');
  share.run(id, 'u_ben', 'editor', now);
  share.run(id, 'u_chen', 'viewer', now);
}
