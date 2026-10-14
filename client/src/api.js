const TOKEN_KEY = 'ajaia.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body) {
  const isForm = body instanceof FormData;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`);
  return data;
}

export const api = {
  users: () => request('GET', '/api/users'),
  login: (email) => request('POST', '/api/login', { email }),
  me: () => request('GET', '/api/me'),
  logout: () => request('POST', '/api/logout'),
  listDocs: () => request('GET', '/api/documents'),
  createDoc: (title) => request('POST', '/api/documents', title ? { title } : {}),
  getDoc: (id) => request('GET', `/api/documents/${id}`),
  updateDoc: (id, patch) => request('PATCH', `/api/documents/${id}`, patch),
  deleteDoc: (id) => request('DELETE', `/api/documents/${id}`),
  importFile: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/api/documents/import', form);
  },
  shares: (id) => request('GET', `/api/documents/${id}/shares`),
  share: (id, email, role) => request('PUT', `/api/documents/${id}/shares`, { email, role }),
  unshare: (id, userId) => request('DELETE', `/api/documents/${id}/shares/${userId}`),
};
