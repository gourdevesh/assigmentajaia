import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Editor from './Editor.jsx';
import ShareDialog from './ShareDialog.jsx';

const ROLE_LABEL = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' };

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const readHash = () => (location.hash.match(/^#\/d\/(.+)$/) || [])[1] ?? null;

/* ---------------------------------- login --------------------------------- */
function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.users().then(setUsers).catch((e) => setError(e.message)); }, []);

  const signIn = async (email) => {
    try { onLogin(await api.login(email)); } catch (e) { setError(e.message); }
  };

  return (
    <main className="login">
      <h1>Ajaia Docs</h1>
      <p className="muted">Demo sign-in. Pick a teammate to continue — you can switch users any time to see sharing from the other side.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="login-list">
        {users.map((u) => (
          <li key={u.id}>
            <button className="login-user" onClick={() => signIn(u.email)}>
              <strong>{u.name}</strong>
              <span className="muted">{u.email}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

/* --------------------------------- sidebar -------------------------------- */
function DocList({ title, docs, activeId, shared, empty }) {
  return (
    <section>
      <h2 className="list-title">{title}</h2>
      {docs.length === 0 ? <p className="muted small">{empty}</p> : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={`#/d/${d.id}`} className={d.id === activeId ? 'active' : ''} aria-current={d.id === activeId ? 'page' : undefined}>
                <span className="doc-name">{d.title}</span>
                <span className="doc-meta">
                  {shared ? `${d.owner_name} · ${ROLE_LABEL[d.role]} · ` : ''}{timeAgo(d.updated_at)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------- document -------------------------------- */
function DocView({ id, me, onChanged, onDeleted, onNotice }) {
  const [doc, setDoc] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing | failed
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('saved'); // saved | dirty | saving | error
  const [sharing, setSharing] = useState(false);
  const pending = useRef({});
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api.getDoc(id)
      .then((d) => { if (!cancelled) { setDoc(d); setTitle(d.title); setState('ready'); } })
      .catch((e) => { if (!cancelled) setState(e.status === 404 ? 'missing' : 'failed'); });
    return () => { cancelled = true; };
  }, [id]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setStatus('saving');
    try {
      await api.updateDoc(id, patch);
      setStatus(Object.keys(pending.current).length ? 'dirty' : 'saved');
      onChanged();
    } catch (e) {
      pending.current = { ...patch, ...pending.current };
      setStatus('error');
      onNotice(e.message);
    }
  }, [id, onChanged, onNotice]);

  const schedule = useCallback((patch) => {
    Object.assign(pending.current, patch);
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [flush]);

  // Save anything still pending when leaving the document or closing the tab.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); flush(); };
  }, [flush]);

  if (state === 'loading') return <div className="center muted">Loading…</div>;
  if (state === 'missing') return <div className="center"><h2>Document not found</h2><p className="muted">It may have been deleted, or it is not shared with you.</p></div>;
  if (state === 'failed') return <div className="center"><h2>Could not open this document</h2><p className="muted">Check your connection and reload.</p></div>;

  const isOwner = doc.role === 'owner';
  const editable = doc.role !== 'viewer';
  const statusText = { saved: 'Saved', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Not saved — retrying on next edit' }[status];

  const commitTitle = () => {
    const t = title.trim();
    if (!t) { setTitle(doc.title); return; }
    if (t !== doc.title) { setDoc({ ...doc, title: t }); schedule({ title: t }); }
  };

  const remove = async () => {
    if (!confirm(`Delete “${doc.title}”? This also removes it for everyone it is shared with.`)) return;
    pending.current = {};
    try { await api.deleteDoc(id); onDeleted(); } catch (e) { onNotice(e.message); }
  };

  return (
    <div className="doc-view">
      <header className="doc-header">
        <input
          className="title-input"
          aria-label="Document title"
          value={title}
          maxLength={120}
          readOnly={!editable}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="doc-actions">
          <span className={`save-status ${status}`} role="status">{editable ? statusText : ''}</span>
          <span className={`badge role-${doc.role}`}>{ROLE_LABEL[doc.role]}</span>
          <button className="btn" onClick={() => setSharing(true)}>Share</button>
          {isOwner && <button className="btn quiet" onClick={remove}>Delete</button>}
        </div>
      </header>
      <Editor
        key={doc.id}
        initialContent={doc.content}
        editable={editable}
        onChange={(html) => schedule({ content: html })}
      />
      {sharing && <ShareDialog doc={doc} me={me} canManage={isOwner} onClose={() => setSharing(false)} />}
    </div>
  );
}

/* ----------------------------------- app ---------------------------------- */
export default function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(Boolean(getToken()));
  const [docs, setDocs] = useState({ owned: [], shared: [] });
  const [activeId, setActiveId] = useState(readHash());
  const [notice, setNotice] = useState('');
  const [users, setUsers] = useState([]);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setMe).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const onHash = () => setActiveId(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refresh = useCallback(() => {
    api.listDocs().then(setDocs).catch((e) => setNotice(e.message));
  }, []);

  useEffect(() => {
    if (!me) return;
    refresh();
    api.users().then(setUsers).catch(() => {});
  }, [me, refresh]);

  const open = (id) => { location.hash = id ? `#/d/${id}` : ''; setActiveId(id); };

  const login = ({ token, user }) => { setToken(token); setMe(user); open(null); };
  const switchUser = async (email) => {
    try { const r = await api.login(email); setToken(r.token); setMe(r.user); open(null); setNotice(''); }
    catch (e) { setNotice(e.message); }
  };
  const logout = async () => { try { await api.logout(); } catch { /* token already invalid */ } setToken(null); setMe(null); open(null); };

  const createDoc = async () => {
    try { const d = await api.createDoc(); refresh(); open(d.id); } catch (e) { setNotice(e.message); }
  };

  const importFile = async (file) => {
    if (!file) return;
    try { const d = await api.importFile(file); refresh(); open(d.id); setNotice(''); }
    catch (e) { setNotice(e.message); }
    finally { fileInput.current.value = ''; }
  };

  if (booting) return <div className="center muted">Loading…</div>;
  if (!me) return <Login onLogin={login} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Ajaia Docs</div>

        <label className="user-switch">
          <span className="muted small">Signed in as</span>
          <select value={me.email} onChange={(e) => switchUser(e.target.value)} aria-label="Switch user">
            {users.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
          </select>
        </label>

        <div className="side-actions">
          <button className="btn primary" onClick={createDoc}>New document</button>
          <button className="btn" onClick={() => fileInput.current.click()}>Import file</button>
          <input ref={fileInput} type="file" hidden accept=".txt,.md,.markdown,.docx" onChange={(e) => importFile(e.target.files[0])} />
        </div>
        <p className="muted small">Import supports .txt, .md and .docx (up to 5 MB). Each file becomes a new editable document.</p>

        <nav className="lists" aria-label="Documents">
          <DocList title="Owned by me" docs={docs.owned} activeId={activeId} empty="No documents yet. Create one or import a file." />
          <DocList title="Shared with me" docs={docs.shared} activeId={activeId} shared empty="Nothing has been shared with you." />
        </nav>

        <button className="btn quiet signout" onClick={logout}>Sign out</button>
      </aside>

      <main className="main">
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button className="btn quiet" onClick={() => setNotice('')}>Dismiss</button>
          </div>
        )}
        {activeId ? (
          <DocView key={activeId} id={activeId} me={me} onChanged={refresh} onNotice={setNotice}
            onDeleted={() => { refresh(); open(null); }} />
        ) : (
          <div className="center">
            <h2>Pick a document</h2>
            <p className="muted">Choose one from the sidebar, create a new one, or import a file.</p>
          </div>
        )}
      </main>
    </div>
  );
}
