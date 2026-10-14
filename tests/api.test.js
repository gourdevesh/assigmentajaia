import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

let server, base;
const tokens = {};

const call = async (who, method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(who ? { authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

before(async () => {
  const app = createApp(openDb(':memory:'));
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  for (const who of ['asha', 'ben', 'chen', 'dana']) {
    const r = await call(null, 'POST', '/api/login', { email: `${who}@ajaia.test` });
    tokens[who] = r.body.token;
  }
});
after(() => server.close());

test('requests without a session are rejected', async () => {
  assert.equal((await call(null, 'GET', '/api/documents')).status, 401);
});

test('documents persist content and survive a reload', async () => {
  const created = await call('asha', 'POST', '/api/documents', { title: 'Plan' });
  assert.equal(created.status, 201);
  const id = created.body.id;
  await call('asha', 'PATCH', `/api/documents/${id}`, { content: '<h1>Hi</h1><p><strong>bold</strong> <u>under</u></p><ul><li>a</li></ul>' });
  const reopened = await call('asha', 'GET', `/api/documents/${id}`);
  assert.match(reopened.body.content, /<strong>bold<\/strong>/);
  assert.match(reopened.body.content, /<u>under<\/u>/);
  assert.match(reopened.body.content, /<ul><li>a<\/li><\/ul>/);
});

test('sharing: access is denied, granted by role, and revoked', async () => {
  const { body: doc } = await call('asha', 'POST', '/api/documents', { title: 'Secret' });
  const url = `/api/documents/${doc.id}`;

  // Not shared yet: invisible to others (404, not 403).
  assert.equal((await call('ben', 'GET', url)).status, 404);
  assert.equal((await call('ben', 'GET', '/api/documents')).body.shared.some((d) => d.id === doc.id), false);

  // Viewer can read but not edit.
  await call('asha', 'PUT', `${url}/shares`, { email: 'chen@ajaia.test', role: 'viewer' });
  const chenView = await call('chen', 'GET', url);
  assert.equal(chenView.status, 200);
  assert.equal(chenView.body.role, 'viewer');
  assert.equal((await call('chen', 'PATCH', url, { content: '<p>nope</p>' })).status, 403);
  assert.equal((await call('chen', 'GET', '/api/documents')).body.shared.length >= 1, true);

  // Editor can edit but not share or delete.
  await call('asha', 'PUT', `${url}/shares`, { email: 'ben@ajaia.test', role: 'editor' });
  assert.equal((await call('ben', 'PATCH', url, { content: '<p>ok</p>' })).status, 200);
  assert.equal((await call('ben', 'PUT', `${url}/shares`, { email: 'dana@ajaia.test', role: 'viewer' })).status, 403);
  assert.equal((await call('ben', 'DELETE', url)).status, 403);

  // Revoking removes access again.
  await call('asha', 'DELETE', `${url}/shares/u_ben`);
  assert.equal((await call('ben', 'GET', url)).status, 404);
});

test('validation: empty titles, bad roles, unknown users', async () => {
  const { body: doc } = await call('asha', 'POST', '/api/documents', {});
  const url = `/api/documents/${doc.id}`;
  assert.equal((await call('asha', 'PATCH', url, { title: '   ' })).status, 400);
  assert.equal((await call('asha', 'PUT', `${url}/shares`, { email: 'ben@ajaia.test', role: 'admin' })).status, 400);
  assert.equal((await call('asha', 'PUT', `${url}/shares`, { email: 'ghost@nowhere.test' })).status, 404);
  assert.equal((await call('asha', 'PUT', `${url}/shares`, { email: 'asha@ajaia.test' })).status, 400);
});

test('saved HTML is sanitized', async () => {
  const { body: doc } = await call('asha', 'POST', '/api/documents', {});
  const r = await call('asha', 'PATCH', `/api/documents/${doc.id}`, {
    content: '<p onclick="x()">hi</p><script>alert(1)</script><img src=x onerror=alert(1)>',
  });
  assert.equal(r.body.content, '<p>hi</p>');
});

test('upload: .md and .txt become new editable documents; other types are rejected', async () => {
  const send = async (name, data) => {
    const form = new FormData();
    form.append('file', new Blob([data]), name);
    const res = await fetch(base + '/api/documents/import', {
      method: 'POST', headers: { authorization: `Bearer ${tokens.asha}` }, body: form,
    });
    return { status: res.status, body: await res.json() };
  };
  const md = await send('notes.md', '# Title\n\nSome **bold** text\n\n- one\n- two');
  assert.equal(md.status, 201);
  assert.equal(md.body.title, 'notes');
  assert.match(md.body.content, /<h1>Title<\/h1>/);
  assert.match(md.body.content, /<strong>bold<\/strong>/);

  const txt = await send('plain.txt', 'Line one\n\nParagraph <two>');
  assert.equal(txt.status, 201);
  assert.match(txt.body.content, /<p>Paragraph &lt;two&gt;<\/p>/);

  assert.equal((await send('image.png', 'xx')).status, 415);
});
