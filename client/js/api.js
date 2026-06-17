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

  listWidgets: () => request('/widgets'),
  createWidget: (widget) => request('/widgets', { method: 'POST', body: widget }),
  removeWidget: (id) => request(`/widgets/${id}`, { method: 'DELETE' }),
  clearWidgets: () => request('/widgets', { method: 'DELETE' }),
};
