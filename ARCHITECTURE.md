# Architecture note

## Shape
One Node process: an Express JSON API plus the built React client served as static files. SQLite via Node's built-in `node:sqlite`
(synchronous, zero-setup, easy for reviewers to run). One deploy artifact, no external services, nothing to pay for.

## What I prioritized
1. **A correct sharing model over breadth.** All permission checks go through one function (`access.js`: owner / editor / viewer).
   Routes declare the capability they need (`canRead`, `canEdit`, `canManage`). Documents you cannot see return **404**, not 403,
   so existence is not leaked. This is what the tests lock down.
2. **Formatting that survives a round-trip.** Tiptap (ProseMirror) rather than hand-rolled `contentEditable`. Content is stored
   as HTML and **sanitized server-side against an allow-list** of the tags the editor can produce, so imports and API writes cannot inject scripts.
3. **A usable editing loop.** Debounced autosave (700 ms), flush on navigation/tab close, visible save state, and a clear failure state.
4. **Useful import.** `.txt`, `.md` (marked), `.docx` (mammoth) all become new documents through the same sanitizer.

## Data model
`users`, `sessions`, `documents(owner_id, title, content, timestamps)`, `shares(document_id, user_id, role)` with
`ON DELETE CASCADE`.

## Auth
Deliberately mocked: choose a seeded user, get a random bearer token stored in `sessions`. Every API route except login/health
requires it, so access logic is real even though identity is not.

## Intentionally deprioritized
- Real authentication (passwords/OAuth), invitations to non-users.
- Real-time collaboration. Concurrent edits are **last write wins**; no presence or CRDT.
- Version history, comments, export, image/attachments.
- `.docx` import keeps headings, lists, bold/italic/underline; tables, images and comments are dropped.
- Free-tier hosting resets the SQLite file on restart.

## Next with 2-4 more hours
Optimistic-concurrency check on save (`updated_at`) to prevent silent overwrites, then Markdown/PDF export and version history,
then presence indicators over SSE. Move to Postgres/Turso for durable hosting.
