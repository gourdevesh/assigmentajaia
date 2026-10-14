# AI workflow note

> Edit this note so it reflects what **you** actually did and decided before submitting.

**Tools:** Claude (chat) for scoping the assignment, choosing the stack, and generating the first implementation of the
API, UI, tests and docs. Tiptap/ProseMirror, marked and mammoth did the heavy lifting for the editor and imports rather than custom code.

**Where AI sped things up:** scaffolding the Express + React project, the SQL schema and access rules, the ~150-line
test suite, the share dialog and toolbar wiring, and drafting the README/architecture text.

**What I changed or rejected** _(fill in with your own edits)_. Examples from this build:
- Dropped a separate underline extension (Tiptap v3 StarterKit already includes it).
- Chose SQLite + a single process over Postgres/Supabase to keep reviewer setup at `npm install && npm start`.
- Chose 404 over 403 for documents a user cannot see.
- Fixed the generated `npm test` script (Node 22 does not accept a bare directory argument).

**How I verified:**
- `npm test`: 6 API tests covering persistence, the sharing matrix, validation, sanitization and import.
- Production build (`vite build`) and a smoke test of the built server (static files, deep links, unknown API route, seeded share visible to Ben).
- _Manual UX pass in the browser:_ **do this yourself** — sign in as each user, format text, refresh, import each file type,
  share/unshare, and confirm the viewer cannot edit. The UI was not exercised in a real browser during generation.
