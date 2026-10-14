import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ?? path.join(root, 'data');
const db = openDb(path.join(dataDir, 'ajaia-docs.sqlite'));
const port = Number(process.env.PORT ?? 3001);

// Express 5 passes startup errors (like a busy port) to this callback.
createApp(db).listen(port, (err) => {
  if (err) {
    console.error(err.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Another Ajaia Docs server is probably still running: open http://localhost:${port}, or stop it first.`
      : err);
    process.exit(1);
  }
  console.log(`Ajaia Docs API listening on http://localhost:${port}`);
});
