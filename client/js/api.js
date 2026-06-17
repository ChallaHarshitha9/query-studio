const TOKEN_KEY = 'qs_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
  });

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  signup: (email, password) => request('/auth/signup', { method: 'POST', body: { email, password } }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),

  runQuery: (sql) => request('/query', { method: 'POST', body: { sql } }),
  getSchema: () => request('/schema'),

  listDatasources: () => request('/datasources'),
  uploadDatasource: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/datasources/upload', { method: 'POST', body: form, isForm: true });
  },
  removeDatasource: (id) => request(`/datasources/${id}`, { method: 'DELETE' }),
  downloadDatasource: async (id) => {
    const token = getToken();
    const res = await fetch(`/api/datasources/${id}/download`, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { const d = await res.json(); if (d?.error) msg = d.error; } catch { /* no JSON body */ }
      throw new Error(msg);
    }
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    return { blob: await res.blob(), filename: match ? match[1] : 'data.csv' };
  },

  listWidgets: () => request('/widgets'),
  createWidget: (widget) => request('/widgets', { method: 'POST', body: widget }),
  renameWidget: (id, name) => request(`/widgets/${id}`, { method: 'PATCH', body: { name } }),
  removeWidget: (id) => request(`/widgets/${id}`, { method: 'DELETE' }),
  clearWidgets: () => request('/widgets', { method: 'DELETE' }),

  listSavedQueries: () => request('/saved-queries'),
  createSavedQuery: (name, sqlText) => request('/saved-queries', { method: 'POST', body: { name, sqlText } }),
  removeSavedQuery: (id) => request(`/saved-queries/${id}`, { method: 'DELETE' }),
};
