# Ajaia Docs

A lightweight collaborative document editor: create and format documents, import files,
and share with teammates as **editor** or **viewer**. Built for the Ajaia AI-Native Full Stack assignment.

**Live demo:** _<paste deployed URL>_  ·  **Walkthrough video:** see `VIDEO_LINK.txt`

## Demo accounts (no password — mocked sign-in)

| User | Email |
|---|---|
| Asha Verma | asha@ajaia.test |
| Ben Carter | ben@ajaia.test |
| Chen Li | chen@ajaia.test |
| Dana Okafor | dana@ajaia.test |

A seeded document, *Welcome to Ajaia Docs*, is owned by Asha, shared with Ben (**can edit**) and Chen (**can view**).
Use the "Signed in as" switcher in the sidebar to see sharing from each side.

## Features

- **Documents:** create, rename (click the title), edit, autosave, reopen after refresh. Deep links via `#/d/<id>`.
- **Formatting:** bold, italic, underline, headings 1-3, bulleted and numbered lists, undo/redo (Tiptap / ProseMirror).
- **File import:** `.txt`, `.md`, `.docx` (max 5 MB) → a new editable document. Unsupported types are rejected with a clear message.
- **Sharing:** one owner per document; owner grants *can edit* or *can view*, changes the role, or removes access.
  The sidebar separates **Owned by me** from **Shared with me** (with owner and role). Viewers get a read-only editor.
- **Persistence:** SQLite (`data/ajaia-docs.sqlite`). Content is stored as sanitized HTML, so formatting round-trips.
- **Validation / errors:** title and role validation, size limits, upload type checks, HTML sanitization, 401/403/404/413/415 handling, visible save-failure state.

## Run locally

Requires Node 22.13+ (uses the built-in `node:sqlite`, so there is nothing native to compile). Run `npm install` in the project root, the folder that contains `package.json`.

```bash
npm install
npm run dev        # API on :3001, web on http://localhost:5173
```

Production-style (single process serving the built client):

```bash
npm run build
npm start          # http://localhost:3001
```

Environment: `PORT` (default 3001), `DATA_DIR` (default `./data`). Delete the data directory to reset to seed data.

## Tests

```bash
npm test
```

Six API tests (Node's built-in runner, in-memory SQLite): auth required, persistence of formatting, the full sharing
matrix (no access → viewer → editor → revoked), validation, HTML sanitization, and file import.

## Deploy

A `Dockerfile` and `render.yaml` are included (Render free web service via Blueprint, or any Docker host).
**Caveat:** on free hosting without a persistent volume, the SQLite file resets on restart/redeploy; seed data is recreated.
To keep data, mount a volume and point `DATA_DIR` at it.

## Project layout

```
server/   Express API: app.js (routes), access.js (permission rules), db.js (schema+seed),
          importers.js (txt/md/docx), sanitize.js
client/   React + Vite UI: App.jsx, Editor.jsx (Tiptap), ShareDialog.jsx, api.js
tests/    API tests
```

See `ARCHITECTURE.md` for decisions and `AI_WORKFLOW.md` for AI usage.
