import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function ShareDialog({ doc, me, canManage, onClose }) {
  const [shares, setShares] = useState(null);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.shares(doc.id).then(setShares).catch((e) => setError(e.message));
    api.users().then(setUsers).catch(() => {});
  }, [doc.id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { setShares(await fn()); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const candidates = users.filter((u) => u.id !== doc.owner_id && !shares?.some((s) => s.user_id === u.id));

  const add = (e) => {
    e.preventDefault();
    if (!email) { setError('Choose someone to share with.'); return; }
    run(() => api.share(doc.id, email, role)).then(() => setEmail(''));
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="share-title">Share “{doc.title}”</h2>
        <p className="muted">Owner: {doc.owner_id === me.id ? 'You' : doc.owner_name}</p>

        {canManage && (
          <form className="share-form" onSubmit={add}>
            <select aria-label="Person" value={email} onChange={(e) => setEmail(e.target.value)}>
              <option value="">Choose a person…</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.email}>{u.name} ({u.email})</option>
              ))}
            </select>
            <select aria-label="Access level" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="btn primary" disabled={busy}>Share</button>
          </form>
        )}
        {!canManage && <p className="muted">Only the owner can change who has access.</p>}

        {error && <p className="error" role="alert">{error}</p>}

        <h3>People with access</h3>
        {shares === null ? <p className="muted">Loading…</p> : shares.length === 0 ? (
          <p className="muted">Not shared with anyone yet.</p>
        ) : (
          <ul className="share-list">
            {shares.map((s) => (
              <li key={s.user_id}>
                <span><strong>{s.name}</strong><br /><span className="muted">{s.email}</span></span>
                {canManage ? (
                  <span className="share-actions">
                    <select aria-label={`Access for ${s.name}`} value={s.role} disabled={busy}
                      onChange={(e) => run(() => api.share(doc.id, s.email, e.target.value))}>
                      <option value="editor">Can edit</option>
                      <option value="viewer">Can view</option>
                    </select>
                    <button className="btn quiet" disabled={busy} onClick={() => run(() => api.unshare(doc.id, s.user_id))}>Remove</button>
                  </span>
                ) : <span className="badge">{s.role === 'editor' ? 'Can edit' : 'Can view'}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="modal-footer"><button className="btn" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
