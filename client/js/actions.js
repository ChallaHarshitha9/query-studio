import { api, getToken, setToken, clearToken } from './api.js';
import { S, MAX_MB } from './state.js';
import { render, buildVisualSQL, setSt, renderModalPreview } from './render.js';

/* ── BOOT / AUTH ────────────────────────────────────── */
export async function boot() {
  const token = getToken();
  if (!token) { S.authed = false; render(); return; }
  try {
    const { user } = await api.me();
    S.user = user;
    S.authed = true;
    render();
    await afterAuth();
  } catch {
    clearToken();
    S.authed = false;
    render();
  }
}

export function setAuthMode(mode) { S.authMode = mode; S.authErr = ''; render(); }

export async function doLogin() {
  const email = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-pass')?.value || '';
  if (!email || !password) { S.authErr = 'Enter email and password'; render(); return; }
  S.authBusy = true; S.authErr = ''; render();
  try {
    const { token, user } = await api.login(email, password);
    setToken(token);
    S.user = user; S.authed = true; S.authBusy = false;
    render();
    await afterAuth();
  } catch (err) {
    S.authBusy = false; S.authErr = err.message; render();
  }
}

export async function doSignup() {
  const email = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-pass')?.value || '';
  if (!email || !password) { S.authErr = 'Enter email and password'; render(); return; }
  S.authBusy = true; S.authErr = ''; render();
  try {
    const { token, user } = await api.signup(email, password);
    setToken(token);
    S.user = user; S.authed = true; S.authBusy = false;
    render();
    await afterAuth();
  } catch (err) {
    S.authBusy = false; S.authErr = err.message; render();
  }
}

export function doLogout() {
  clearToken();
  stopAutoRefresh();
  S.authed = false; S.user = null;
  S.activeSchema = {}; S.uploadedFiles = []; S.widgets = []; S.savedQueries = [];
  S.curData = []; S.curCols = [];
  S.autoRefresh = false; S.dashboardUpdatedAt = null;
  S.pendingChartSuggestion = null; S.modal = null;
  S.page = 'builder';
  render();
}

async function afterAuth() {
  await Promise.all([refreshSchema(), refreshDatasources(), refreshSavedQueries()]);
  render();
  setSt('Ready — PostgreSQL connected', 'ok');
}

/* ── NAV ────────────────────────────────────────────── */
export async function go(p) {
  S.page = p;
  if (p === 'dashboard') await loadWidgetsData();
  render();
}

export function toggleSchema(t) {
  S.schemaOpen[t] = S.schemaOpen[t] === false ? true : false;
  render();
}

export function toggleVisual() {
  const ta = document.getElementById('sql-ta');
  if (ta) S.sqlText = ta.value;
  S.isVisual = !S.isVisual;
  render();
}

export function clearQ() {
  S.sqlText = ''; S.curData = []; S.curCols = [];
  setSt('Cleared', 'idle');
  render();
}

/* ── VISUAL BUILDER ─────────────────────────────────── */
function gv(id) { const el = document.getElementById(id); return el ? el.value : null; }

export function updateVis() {
  S.vSel = gv('v-sel') || S.vSel;
  S.vFrom = gv('v-from') || S.vFrom;
  S.vWhere = gv('v-where') ?? S.vWhere;
  S.vGrp = gv('v-grp') ?? S.vGrp;
  S.vOrd = gv('v-ord') ?? S.vOrd;
  S.vLim = gv('v-lim') ?? S.vLim;
  S.sqlText = buildVisualSQL();
  const genEl = document.querySelector('.vis-gen-sql');
  if (genEl) genEl.textContent = S.sqlText;
}

export function insertSnip(s) {
  const ta = document.getElementById('sql-ta');
  if (!ta) return;
  const p = ta.selectionStart;
  const before = ta.value.slice(0, p);
  const after = ta.value.slice(ta.selectionEnd);
  ta.value = before + (before.length && before[before.length - 1] !== ' ' ? ' ' : '') + s + ' ' + after;
  ta.focus();
  ta.selectionStart = ta.selectionEnd = p + s.length + 1;
}

/* ── NATURAL LANGUAGE → SQL ──────────────────────────── */
export async function generateSQL() {
  const input = document.getElementById('nl-prompt');
  const prompt = input?.value.trim();
  if (!prompt) { setSt('Describe what you want first', 'err'); return; }

  setSt('Generating SQL...', 'run');
  try {
    const { sql } = await api.nlToSql(prompt);
    S.sqlText = sql;
    S.isVisual = false;
    S.curData = []; S.curCols = [];
    setSt('SQL generated — review it, then click Run', 'ok');
  } catch (err) {
    setSt('Could not generate SQL: ' + err.message, 'err');
  }
  render();
}

export async function generateChart() {
  const input = document.getElementById('nl-prompt');
  const prompt = input?.value.trim();
  if (!prompt) { setSt('Describe the chart you want first', 'err'); return; }

  setSt('Designing chart...', 'run');
  try {
    const suggestion = await api.nlToChart(prompt);
    const { rows } = await api.runQuery(suggestion.sql);
    if (!rows.length) {
      setSt('Query returned no rows — nothing to chart. Try a different prompt.', 'err');
      S.curData = []; S.curCols = [];
      render();
      return;
    }
    S.sqlText = suggestion.sql;
    S.isVisual = false;
    S.curData = rows;
    S.curCols = Object.keys(rows[0]);
    S.selChart = suggestion.chartType;
    S.pendingChartSuggestion = {
      name: suggestion.name,
      labelCol: suggestion.labelCol,
      valCol: suggestion.valCol,
      agg: suggestion.agg,
    };
    S.page = 'builder';
    S.modal = 'save';
    setSt(`${rows.length} row${rows.length !== 1 ? 's' : ''} returned — review the suggested chart, then add it`, 'ok');
  } catch (err) {
    setSt('Could not generate chart: ' + err.message, 'err');
  }
  render();
}

/* ── QUERY EXECUTION ────────────────────────────────── */
export async function runQuery() {
  const ta = document.getElementById('sql-ta');
  if (ta) S.sqlText = ta.value;
  const sql = S.sqlText.trim();
  if (!sql) { setSt('Enter a query first', 'err'); return; }

  setSt('Running...', 'run');
  try {
    const { rows } = await api.runQuery(sql);
    S.curData = rows;
    S.curCols = rows.length ? Object.keys(rows[0]) : [];
    setSt(`${rows.length} row${rows.length !== 1 ? 's' : ''} returned · ${new Date().toLocaleTimeString()}`, 'ok');
  } catch (err) {
    setSt('SQL Error: ' + err.message, 'err');
    S.curData = []; S.curCols = [];
  }
  render();
}

export function exportCSV() {
  if (!S.curData.length) return;
  const rows = [S.curCols.join(','), ...S.curData.map(r => S.curCols.map(c => JSON.stringify(r[c] ?? '')).join(','))];
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
  a.download = 'query_results.csv';
  a.click();
}

/* ── SCHEMA / DATA SOURCES ──────────────────────────── */
export async function refreshSchema() {
  try {
    const { tables } = await api.getSchema();
    S.activeSchema = tables;
  } catch (err) {
    setSt('Could not load schema: ' + err.message, 'err');
  }
}

export async function refreshDatasources() {
  try {
    const { datasources } = await api.listDatasources();
    S.uploadedFiles = datasources;
    S.connBadge = datasources.length
      ? 'Demo data + ' + datasources.length + ' uploaded table' + (datasources.length !== 1 ? 's' : '')
      : 'Demo data (gnn_alerts, incidents, users)';
    S.connTag = 'connected';
  } catch (err) {
    setSt('Could not load data sources: ' + err.message, 'err');
  }
}

export async function handleCSVUpload(e) {
  const files = Array.from(e.target.files || []);
  const errEl = document.getElementById('csv-err');
  if (errEl) errEl.innerHTML = '';

  for (const file of files) {
    if (file.size > MAX_MB * 1024 * 1024) {
      if (errEl) errEl.innerHTML = `<div class="warn-box"><strong>${file.name}</strong> is ${(file.size / 1024 / 1024).toFixed(1)}MB which exceeds the ${MAX_MB}MB limit.</div>`;
      continue;
    }
    try {
      const { tableName } = await api.uploadDatasource(file);
      S.sqlText = `SELECT * FROM ${tableName} LIMIT 20`;
      S.curData = []; S.curCols = [];
    } catch (err) {
      if (errEl) errEl.innerHTML = `<div class="warn-box">Failed to upload <strong>${file.name}</strong>: ${err.message}</div>`;
    }
  }

  await Promise.all([refreshSchema(), refreshDatasources()]);
  render();
}

export async function removeFile(id) {
  try {
    await api.removeDatasource(id);
    await Promise.all([refreshSchema(), refreshDatasources()]);
    S.curData = []; S.curCols = [];
    render();
  } catch (err) {
    setSt('Could not remove file: ' + err.message, 'err');
    render();
  }
}

/* ── WIDGETS / DASHBOARD ────────────────────────────── */
export function openSaveModal() {
  if (!S.curData.length) return;
  S.modal = 'save'; S.selChart = 'bar'; S.pendingChartSuggestion = null;
  render();
}
export function closeModal() { S.modal = null; S.pendingChartSuggestion = null; render(); }
export function selChartType(t, evt) {
  S.selChart = t;
  document.querySelectorAll('.ct-btn').forEach(b => b.classList.remove('sel'));
  evt.currentTarget.classList.add('sel');
  renderModalPreview();
}
export function updateModalPreview() { renderModalPreview(); }

// Whether every value of `colName` in the current results looks numeric
// ("metric") vs. categorical ("dimension") — drives the Smart Mode defaults.
function detectColumnType(colName) {
  if (!S.curData.length || !colName) return 'dimension';
  const allNumeric = S.curData.every(row => {
    const v = row[colName];
    return v !== null && v !== '' && !isNaN(Number(v));
  });
  return allNumeric ? 'metric' : 'dimension';
}

export function handleValueChange() {
  const smart = document.getElementById('smart-mode')?.checked;
  const col = document.getElementById('m-value')?.value;
  const aggEl = document.getElementById('m-agg');
  if (smart && col && aggEl) {
    if (detectColumnType(col) === 'metric') {
      aggEl.innerHTML = `<option value="sum">SUM</option><option value="avg">AVG</option><option value="min">MIN</option><option value="max">MAX</option><option value="count">COUNT</option>`;
      aggEl.value = 'sum';
    } else {
      aggEl.innerHTML = `<option value="count">COUNT</option>`;
      aggEl.value = 'count';
    }
  }
  renderModalPreview();
}

export function handleLabelChange() {
  const smart = document.getElementById('smart-mode')?.checked;
  const col = document.getElementById('m-label')?.value;
  if (smart && col) {
    const unique = new Set(S.curData.map(r => r[col]));
    if (unique.size > 15) {
      alert('That column has ' + unique.size + ' distinct values — consider a table view or a column with fewer categories for a readable chart.');
    }
  }
  renderModalPreview();
}

export async function saveWidget() {
  const name = document.getElementById('m-name')?.value?.trim() || 'Widget ' + new Date().toLocaleTimeString();
  const labelCol = document.getElementById('m-label')?.value || S.curCols[0];
  const valCol = document.getElementById('m-value')?.value || S.curCols[1] || S.curCols[0];
  const agg = document.getElementById('m-agg')?.value || 'count';
  try {
    await api.createWidget({ name, chartType: S.selChart, sqlText: S.sqlText, labelCol, valCol, agg });
    S.modal = null;
    S.pendingChartSuggestion = null;
    // Widget now owns this query — clear the editor so the builder starts fresh.
    S.sqlText = ''; S.curData = []; S.curCols = [];
    await go('dashboard');
  } catch (err) {
    setSt('Could not save widget: ' + err.message, 'err');
    render();
  }
}

export async function renameWidget(id) {
  const w = S.widgets.find(w => w.id === id);
  if (!w) return;
  const name = prompt('Rename widget:', w.name);
  if (!name || !name.trim() || name.trim() === w.name) return;
  try {
    await api.renameWidget(id, name.trim());
    w.name = name.trim();
    render();
  } catch (err) {
    setSt('Could not rename widget: ' + err.message, 'err');
    render();
  }
}

export async function loadWidgetsData() {
  try {
    const { widgets } = await api.listWidgets();
    const withData = await Promise.all(widgets.map(async w => {
      try {
        const { rows } = await api.runQuery(w.sql_text);
        return { ...w, data: rows, cols: rows.length ? Object.keys(rows[0]) : [] };
      } catch {
        return { ...w, data: [], cols: [] };
      }
    }));
    S.widgets = withData;
    S.dashboardUpdatedAt = new Date();
  } catch (err) {
    setSt('Could not load widgets: ' + err.message, 'err');
  }
}

export async function refreshDashboard() {
  await loadWidgetsData();
  render();
}

export async function refreshWidget(id) {
  const w = S.widgets.find(w => w.id === id);
  if (!w) return;
  try {
    const { rows } = await api.runQuery(w.sql_text);
    w.data = rows;
    w.cols = rows.length ? Object.keys(rows[0]) : [];
    render();
  } catch (err) {
    setSt('Could not refresh widget: ' + err.message, 'err');
  }
}

let autoRefreshTimer = null;
const AUTO_REFRESH_MS = 15000;

export function toggleAutoRefresh() {
  S.autoRefresh = !S.autoRefresh;
  if (S.autoRefresh) {
    autoRefreshTimer = setInterval(() => {
      if (S.page === 'dashboard') refreshDashboard();
    }, AUTO_REFRESH_MS);
  } else {
    stopAutoRefresh();
  }
  render();
}

function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

export async function removeW(id) {
  try {
    await api.removeWidget(id);
    S.widgets = S.widgets.filter(w => w.id !== id);
    render();
  } catch (err) {
    setSt('Could not remove widget: ' + err.message, 'err');
  }
}

export async function clearDash() {
  if (!S.widgets.length || !confirm('Remove all widgets from dashboard?')) return;
  try {
    await api.clearWidgets();
    S.widgets = [];
    render();
  } catch (err) {
    setSt('Could not clear dashboard: ' + err.message, 'err');
  }
}

/* ── SAVED QUERIES ──────────────────────────────────── */
export async function refreshSavedQueries() {
  try {
    const { savedQueries } = await api.listSavedQueries();
    S.savedQueries = savedQueries;
  } catch (err) {
    setSt('Could not load saved queries: ' + err.message, 'err');
  }
}

export async function saveQuery() {
  const ta = document.getElementById('sql-ta');
  if (ta) S.sqlText = ta.value;
  const sql = S.sqlText.trim();
  if (!sql) { setSt('Enter a query first', 'err'); return; }

  const name = prompt('Name this query:', '');
  if (!name || !name.trim()) return;
  try {
    await api.createSavedQuery(name.trim(), sql);
    await refreshSavedQueries();
    setSt('Query saved', 'ok');
    render();
  } catch (err) {
    setSt('Could not save query: ' + err.message, 'err');
    render();
  }
}

export function loadSavedQuery(id) {
  const q = S.savedQueries.find(q => q.id === id);
  if (!q) return;
  S.sqlText = q.sql_text;
  S.isVisual = false;
  S.curData = []; S.curCols = [];
  S.page = 'builder';
  render();
}

export async function removeSavedQuery(id) {
  try {
    await api.removeSavedQuery(id);
    S.savedQueries = S.savedQueries.filter(q => q.id !== id);
    render();
  } catch (err) {
    setSt('Could not remove saved query: ' + err.message, 'err');
    render();
  }
}

/* ── CSV DOWNLOAD ───────────────────────────────────── */
export async function downloadDatasource(id) {
  try {
    const { blob, filename } = await api.downloadDatasource(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    setSt('Could not download file: ' + err.message, 'err');
    render();
  }
}
