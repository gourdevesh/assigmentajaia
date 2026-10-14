/**
 * Access model: one owner per document, plus per-user shares with a role.
 *   owner  -> read, edit, rename, share, delete
 *   editor -> read, edit, rename
 *   viewer -> read
 */
export const ROLES = ['viewer', 'editor'];

export function getRole(db, documentId, userId) {
  const doc = db.prepare('SELECT owner_id FROM documents WHERE id = ?').get(documentId);
  if (!doc) return null;
  if (doc.owner_id === userId) return 'owner';
  const share = db
    .prepare('SELECT role FROM shares WHERE document_id = ? AND user_id = ?')
    .get(documentId, userId);
  return share ? share.role : null;
}

export const canRead = (role) => role !== null;
export const canEdit = (role) => role === 'owner' || role === 'editor';
export const canManage = (role) => role === 'owner';
