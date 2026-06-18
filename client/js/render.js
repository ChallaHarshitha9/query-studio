import { I } from './icons.js';
import { S, PAL, MAX_MB } from './state.js';

export function escHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function render() {
  const app = document.getElementById('APP');
  app.innerHTML = '';

  if (!S.authed) {
    app.appendChild(renderAuth());
    closeModalUI();
    return;
  }

  app.appendChild(renderSidebar());
  if (S.page === 'builder') app.appendChild(renderBuilder());
  else if (S.page === 'dashboard') app.appendChild(renderDashboard());
  else if (S.page === 'connect') app.appendChild(renderConnect());
  else if (S.page === 'ai') app.appendChild(renderAI());

  const modal = document.getElementById('MODAL');
  if (S.modal) {
    modal.style.display = 'flex';
    modal.innerHTML = '';
    modal.appendChild(renderModal());
  } else {
    closeModalUI();
  }

  if (S.page === 'dashboard') {
    setTimeout(() => S.widgets.forEach(w => {
      if (!['table', 'kpi'].includes(w.chart_type)) drawChart(w);
    }), 60);
  }
  if (S.modal === 'save') {
    setTimeout(renderModalPreview, 60);
  }
}

function closeModalUI() {
  const modal = document.getElementById('MODAL');
  modal.style.display = 'none';
}

/* ── AUTH ───────────────────────────────────────────── */
function renderAuth() {
  const wrap = document.createElement('div');
  wrap.className = 'auth-wrap';
  const isSignup = S.authMode === 'signup';
  wrap.innerHTML = `
    <div class="auth-card">
      <h2>${I.db} Query Studio</h2>
      <div class="auth-sub">${isSignup ? 'Create an account to start querying.' : 'Sign in to your workspace.'}</div>
      ${S.authErr ? `<div class="auth-err">${escHTML(S.authErr)}</div>` : ''}
      <div class="field-g"><label class="flabel">Email</label>
        <input class="finput" id="auth-email" type="email" placeholder="you@example.com" autofocus/>
      </div>
      <div class="field-g"><label class="flabel">Password</label>
        <input class="finput" id="auth-pass" type="password" placeholder="${isSignup ? 'At least 8 characters' : '••••••••'}"/>
      </div>
      <button class="btn primary" style="width:100%;justify-content:center" id="auth-submit" ${S.authBusy ? 'disabled' : ''} onclick="${isSignup ? 'doSignup' : 'doLogin'}()">
        ${S.authBusy ? 'Please wait…' : (isSignup ? 'Create account' : 'Sign in')}
      </button>
      <div class="auth-toggle">
        ${isSignup ? 'Already have an account? <a onclick="setAuthMode(\'login\')">Sign in</a>' : 'Need an account? <a onclick="setAuthMode(\'signup\')">Create one</a>'}
      </div>
    </div>`;
  setTimeout(() => {
    const onEnter = (e) => { if (e.key === 'Enter') (isSignup ? window.doSignup() : window.doLogin()); };
    document.getElementById('auth-email')?.addEventListener('keydown', onEnter);
    document.getElementById('auth-pass')?.addEventListener('keydown', onEnter);
  }, 10);
  return wrap;
}

/* ── SIDEBAR ────────────────────────────────────────── */
function renderSidebar() {
  const s = document.createElement('div');
  s.className = 'sidebar';

  const schemaHTML = Object.entries(S.activeSchema).map(([t, cols]) => `
    <div class="stbl">
      <div class="stbl-hdr" onclick="toggleSchema('${t}')">
        ${I.tbl}<span style="flex:1">${t}</span>
        ${S.schemaOpen[t] === false ? I.chevr : I.chevd}
      </div>
      ${S.schemaOpen[t] === false ? '' : cols.map(c => `
        <div class="scol">${I.col}<span style="flex:1">${c.n}</span><span class="ctype">${c.t}</span></div>
      `).join('')}
    </div>`).join('') || '<div style="font-size:11px;color:var(--text3);padding:4px 6px">No schema available</div>';

  const wHTML = S.widgets.length
    ? S.widgets.map(w => `<div class="wlist-item" onclick="go('dashboard')"><div class="wlist-dot"></div>${escHTML(w.name)}</div>`).join('')
    : '<div style="font-size:11px;color:var(--text3);padding:2px 4px">No widgets yet</div>';

  const qHTML = S.savedQueries.length
    ? S.savedQueries.map(q => `
      <div class="wlist-item" onclick="loadSavedQuery(${q.id})" title="${escHTML(q.sql_text)}">
        <div class="wlist-dot" style="background:var(--green)"></div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHTML(q.name)}</span>
        <span onclick="event.stopPropagation();removeSavedQuery(${q.id})" style="color:var(--text3);display:flex" title="Delete">${I.x}</span>
      </div>`).join('')
    : '<div style="font-size:11px;color:var(--text3);padding:2px 4px">No saved queries yet</div>';

  s.innerHTML = `
    <div class="logo">${I.db}<span>Query Studio</span></div>
    <div class="nav-sec">Menu</div>
    <div class="nav-item ${S.page === 'builder' ? 'active' : ''}" onclick="go('builder')">${I.code} Query builder</div>
    <div class="nav-item ${S.page === 'dashboard' ? 'active' : ''}" onclick="go('dashboard')">${I.dash} Dashboard</div>
    <div class="nav-item ${S.page === 'connect' ? 'active' : ''}" onclick="go('connect')">${I.plug} Data sources</div>
    <div class="nav-item ${S.page === 'ai' ? 'active' : ''}" onclick="go('ai')">${I.ai} AI Assistant</div>
    <div class="nav-sec" style="margin-top:8px">Schema</div>
    <div class="schema-wrap">${schemaHTML}</div>
    <div class="sidebar-bottom">
      <div class="nav-sec" style="padding:0 2px 5px">Saved queries</div>
      ${qHTML}
      <div class="nav-sec" style="padding:6px 2px 5px">Saved widgets</div>
      ${wHTML}
    </div>
    <div class="sidebar-user">
      <span title="${escHTML(S.user?.email || '')}">${escHTML(S.user?.email || '')}</span>
      <button class="btn" style="padding:3px 7px" onclick="doLogout()" title="Sign out">${I.logout}</button>
    </div>`;
  return s;
}

/* ── QUERY BUILDER ──────────────────────────────────── */
function renderBuilder() {
  const d = document.createElement('div');
  d.className = 'main';
  const genSQL = buildVisualSQL();

  d.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">
        <span>${escHTML(S.connBadge)}</span>
        <span class="tag ${S.connTag === 'connected' ? 't-green' : S.connTag === 'connecting' ? 't-amber' : 't-blue'}">${S.connTag}</span>
      </div>
      <button class="btn" onclick="toggleVisual()">${S.isVisual ? I.code + ' SQL' : I.rows + ' Visual'}</button>
      <button class="btn" onclick="saveQuery()">${I.bookmark} Save query</button>
      <button class="btn" onclick="clearQ()">${I.clear} Clear</button>
      <button class="btn primary lg" style="margin-left:10px" onclick="runQuery()">${I.play} Run</button>
    </div>
    <div class="content">
      ${!S.isVisual ? `
      <div class="panel">
        <div class="phdr">${I.code} SQL editor</div>
        <textarea class="sql" id="sql-ta" spellcheck="false">${escHTML(S.sqlText)}</textarea>
        <div class="snippets">
          ${['SELECT *', 'WHERE', 'GROUP BY', 'ORDER BY', 'COUNT(*)', 'SUM()', 'AVG()', 'LIMIT 10', 'JOIN ON', 'HAVING'].map(s => `<span class="snip" onclick="insertSnip('${s}')">${s}</span>`).join('')}
        </div>
      </div>` : `
      <div class="panel">
        <div class="vis-row"><span class="kw">SELECT</span><input class="ci" id="v-sel" value="${escHTML(S.vSel)}" oninput="updateVis()" placeholder="columns or expressions"/></div>
        <div class="vis-row"><span class="kw">FROM</span>
          <select class="ci" id="v-from" onchange="updateVis()">
            ${Object.keys(S.activeSchema).map(t => `<option ${t === S.vFrom ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="vis-row"><span class="kw">WHERE</span><input class="ci" id="v-where" value="${escHTML(S.vWhere)}" placeholder="e.g. status = 'open'" oninput="updateVis()"/></div>
        <div class="vis-row"><span class="kw">GROUP BY</span><input class="ci" id="v-grp" value="${escHTML(S.vGrp)}" oninput="updateVis()"/></div>
        <div class="vis-row"><span class="kw">ORDER BY</span>
          <input class="ci" id="v-ord" value="${escHTML(S.vOrd)}" style="flex:1;margin-right:6px" oninput="updateVis()"/>
          <select class="ci" id="v-lim" style="width:100px" onchange="updateVis()">
            ${['', '10', '50', '100', '500'].map(v => `<option value="${v}" ${v === S.vLim ? 'selected' : ''}>${v ? 'Limit ' + v : 'No limit'}</option>`).join('')}
          </select>
        </div>
        <div class="vis-gen-sql">${escHTML(genSQL)}</div>
      </div>`}

      ${S.curData.length ? `
      <div class="panel">
        <div class="phdr">
          ${I.rows} Results
          <span style="margin-left:4px;font-weight:400;color:var(--text3)">(${S.curData.length} row${S.curData.length !== 1 ? 's' : ''})</span>
          <div class="phdr-right">
            <button class="btn" onclick="exportCSV()" style="font-size:11px">${I.down} CSV</button>
            <button class="btn success" onclick="openSaveModal()" style="font-size:11px">${I.chart} Save as widget</button>
          </div>
        </div>
        <div class="results-wrap">
          <table class="rt">
            <thead><tr>${S.curCols.map(c => `<th title="${escHTML(c)}">${escHTML(c)}</th>`).join('')}</tr></thead>
            <tbody>${S.curData.map(row => '<tr>' + S.curCols.map(c => `<td title="${escHTML(row[c] ?? '')}">${escHTML(row[c] ?? '')}</td>`).join('') + '</tr>').join('')}</tbody>
          </table>
        </div>
      </div>` : ''}
    </div>
    <div class="statusbar">
      <div class="status-dot ${S.statusState === 'ok' ? 'ok' : S.statusState === 'err' ? 'err' : S.statusState === 'run' ? 'run' : ''}"></div>
      <span>${escHTML(S.statusText)}</span>
    </div>`;
  return d;
}

export function buildVisualSQL() {
  let q = `SELECT ${S.vSel || '*'}\nFROM ${S.vFrom}`;
  if (S.vWhere) q += `\nWHERE ${S.vWhere}`;
  if (S.vGrp) q += `\nGROUP BY ${S.vGrp}`;
  if (S.vOrd) q += `\nORDER BY ${S.vOrd}`;
  if (S.vLim) q += `\nLIMIT ${S.vLim}`;
  return q;
}

/* ── AI ASSISTANT ───────────────────────────────────── */
function renderAI() {
  const d = document.createElement('div');
  d.className = 'main';
  d.innerHTML = `
    <div class="topbar"><div class="topbar-title">${I.ai} AI Assistant</div></div>
    <div class="content">
      <div class="panel">
        <div class="phdr">${I.bookmark} Describe what you want in English</div>
        <div style="display:flex;gap:8px;padding:10px 12px">
          <input class="finput" id="nl-prompt" style="flex:1" placeholder="e.g. critical alarms by region in the last day" onkeydown="if(event.key==='Enter'){generateSQL()}"/>
        </div>
        <div style="display:flex;gap:8px;padding:0 12px 12px">
          <button class="btn primary" onclick="generateSQL()">${I.code} Generate SQL</button>
          <button class="btn primary" onclick="generateChart()">${I.chart} Generate Chart</button>
        </div>
        <div style="padding:0 12px 12px;font-size:10.5px;color:var(--text3)">
          <strong>Generate SQL</strong> can write SELECT, INSERT, UPDATE, DELETE, or other statements and only fills the
          query editor — review it on the Query builder page before clicking Run, since it can modify or delete data.<br/>
          <strong>Generate Chart</strong> is read-only: it writes a SELECT, runs it, and also picks a chart type plus
          label/value columns and an aggregation — then opens the "Save as widget" dialog with everything pre-filled and
          a live preview, so you can review and tweak before adding it to your dashboard.
        </div>
      </div>
      ${S.curData.length ? `
      <div class="panel">
        <div class="phdr">${I.rows} Last result
          <span style="margin-left:4px;font-weight:400;color:var(--text3)">(${S.curData.length} row${S.curData.length !== 1 ? 's' : ''})</span>
        </div>
        <div class="results-wrap">
          <table class="rt">
            <thead><tr>${S.curCols.map(c => `<th title="${escHTML(c)}">${escHTML(c)}</th>`).join('')}</tr></thead>
            <tbody>${S.curData.slice(0, 20).map(row => '<tr>' + S.curCols.map(c => `<td title="${escHTML(row[c] ?? '')}">${escHTML(row[c] ?? '')}</td>`).join('') + '</tr>').join('')}</tbody>
          </table>
        </div>
      </div>` : ''}
    </div>
    <div class="statusbar">
      <div class="status-dot ${S.statusState === 'ok' ? 'ok' : S.statusState === 'err' ? 'err' : S.statusState === 'run' ? 'run' : ''}"></div>
      <span>${escHTML(S.statusText)}</span>
    </div>`;
  return d;
}

/* ── DASHBOARD ──────────────────────────────────────── */
function renderDashboard() {
  const d = document.createElement('div');
  d.className = 'main';
  const hasW = S.widgets.length > 0;
  d.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">
        Dashboard
        ${S.dashboardUpdatedAt ? `<span style="margin-left:8px;font-size:11px;font-weight:400;color:var(--text3)">Updated ${S.dashboardUpdatedAt.toLocaleTimeString()}</span>` : ''}
      </div>
      <button class="btn" onclick="refreshDashboard()">${I.refresh} Refresh</button>
      <button class="btn ${S.autoRefresh ? 'primary' : ''}" onclick="toggleAutoRefresh()">${I.refresh} Auto-refresh: ${S.autoRefresh ? 'On' : 'Off'}</button>
      <button class="btn" onclick="go('builder')">${I.plus} Add widget</button>
      <button class="btn danger-outline" onclick="clearDash()">${I.trash} Clear all</button>
    </div>
    <div class="content">
      ${!hasW ? `
      <div class="empty-state">
        ${I.dash.replace('class="nav-icon"', 'width="40" height="40"')}
        <h3>Dashboard is empty</h3>
        <p>Run a query, then click "Save as widget" to add charts here</p>
      </div>` : `<div class="dash-grid">${S.widgets.map(renderWidgetCard).join('')}</div>`}
    </div>`;
  return d;
}

function renderWidgetCard(w) {
  return `<div class="wcard">
    <div class="wcard-hdr">
      <span class="wcard-hdr-name" title="${escHTML(w.name)}">${escHTML(w.name)}</span>
      <button class="btn" style="padding:3px 6px" onclick="refreshWidget(${w.id})" title="Refresh">${I.refresh}</button>
      <button class="btn" style="padding:3px 6px" onclick="renameWidget(${w.id})" title="Rename">${I.pencil}</button>
      <button class="btn" style="padding:3px 6px" onclick="removeW(${w.id})" title="Remove">${I.x}</button>
    </div>
    <div class="wcard-body">
      ${w.chart_type === 'table' ? renderTableW(w) : w.chart_type === 'kpi' ? renderKPIW(w) : `<canvas id="cv-${w.id}" height="180"></canvas>`}
    </div>
  </div>`;
}

function renderTableW(w) {
  const cols = w.cols || [];
  const data = w.data || [];
  return `<div style="overflow:auto;max-height:180px"><table class="rt" style="font-size:11px">
    <thead><tr>${cols.map(c => `<th>${escHTML(c)}</th>`).join('')}</tr></thead>
    <tbody>${data.slice(0, 10).map(row => '<tr>' + cols.map(c => `<td>${escHTML(row[c] ?? '')}</td>`).join('') + '</tr>').join('')}</tbody>
  </table></div>`;
}
function renderKPIW(w) {
  const data = w.data || [];
  const agg = w.agg || 'count';
  const vals = data.map(x => Number(x[w.val_col])).filter(v => !isNaN(v));
  const result = aggregate(agg, vals, data.length);
  const display = Number.isInteger(result) ? result.toLocaleString() : result.toFixed(2);
  return `<div class="kpi-card">
    <div class="kpi-label">${agg.toUpperCase()} (${escHTML(w.val_col || '')})</div>
    <div class="kpi-value">${display}</div>
    <div class="kpi-sub">${data.length} rows</div>
  </div>`;
}

function aggregate(agg, numericValues, rowCount) {
  if (agg === 'sum') return numericValues.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return numericValues.length ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length : 0;
  if (agg === 'min') return numericValues.length ? Math.min(...numericValues) : 0;
  if (agg === 'max') return numericValues.length ? Math.max(...numericValues) : 0;
  return rowCount; // count
}

/* ── DATA SOURCES ───────────────────────────────────── */
function renderConnect() {
  const d = document.createElement('div');
  d.className = 'main';
  d.innerHTML = `
    <div class="topbar"><div class="topbar-title">Data sources</div></div>
    <div class="content">
      <div class="conn-card active">
        <div class="conn-icon" style="background:#fdf4ff;font-size:18px">🧪</div>
        <div style="flex:1">
          <div class="conn-card-title">Demo data</div>
          <div class="conn-card-desc">gnn_alerts · incidents · users — read-only, shared by every account</div>
        </div>
        <span style="color:var(--green)">${I.check}</span>
      </div>

      <div style="font-size:12.5px;font-weight:600;margin:14px 0 7px">Your uploaded tables</div>
      ${S.uploadedFiles.length ? S.uploadedFiles.map(f => `
        <div class="file-row">
          <span style="color:var(--green)">${I.file}</span>
          <div style="flex:1">
            <div class="file-row-name">${escHTML(f.original_filename || f.table_name)}</div>
            <div class="file-row-meta">${(f.row_count || 0).toLocaleString()} rows · ${((f.size_bytes || 0) / 1024).toFixed(1)} KB · table: <code style="font-size:10px;background:var(--bg);padding:1px 4px;border-radius:3px">${escHTML(f.table_name)}</code></div>
          </div>
          <button class="btn" style="font-size:11px;padding:3px 8px" onclick="downloadDatasource(${f.id})">${I.down} Download</button>
          <button class="btn danger-outline" style="font-size:11px;padding:3px 8px" onclick="removeFile(${f.id})">${I.trash} Remove</button>
        </div>`).join('') : '<div style="font-size:12px;color:var(--text3);margin-bottom:8px">No files uploaded yet</div>'}
      <div class="upload-zone" onclick="document.getElementById('csv-file-in').click()">
        ${I.upload}
        <h4>Click to upload CSV or TSV</h4>
        <p>Max ${MAX_MB}MB per file · filename becomes the table name · multiple files allowed<br/>Tables are created in your own Postgres schema · types auto-detected (NUMBER / TEXT)</p>
        <input type="file" id="csv-file-in" accept=".csv,.tsv,.txt" multiple style="display:none" onchange="handleCSVUpload(event)"/>
      </div>
      <div id="csv-err"></div>
    </div>`;
  return d;
}

/* ── MODAL ──────────────────────────────────────────── */
function labelFieldText(chartType) {
  return ['pie', 'doughnut'].includes(chartType) ? 'Name column' : 'X axis (category)';
}
function valueFieldText(chartType) {
  return ['pie', 'doughnut'].includes(chartType) ? 'Value column' : chartType === 'kpi' ? 'Value column' : 'Y axis (value)';
}

function renderModal() {
  const cols = S.curCols;
  if (S.modal === 'save') {
    const sug = S.pendingChartSuggestion;
    const ct = S.selChart;
    const showLabel = !['table', 'kpi'].includes(ct);
    const showValue = ct !== 'table';
    const div = document.createElement('div');
    div.className = 'modal modal-wide';
    div.innerHTML = `
      <h3>Save as widget${sug ? ' <span style="font-size:10.5px;font-weight:500;color:var(--text3)">— AI suggested</span>' : ''}</h3>
      <div style="display:flex;gap:18px">
        <div style="flex:1;min-width:0">
          <div class="field-g"><label class="flabel">Widget name</label>
            <input class="finput" id="m-name" value="${escHTML(sug?.name || '')}" placeholder="e.g. Alerts by severity" autofocus/>
          </div>
          <div class="field-g" style="display:flex;align-items:center;gap:8px">
            <label class="flabel" style="margin-bottom:0">Smart Mode</label>
            <input type="checkbox" id="smart-mode" ${sug ? '' : 'checked'} style="width:15px;height:15px"/>
          </div>
          <div class="field-g">
            <label class="flabel">Chart type</label>
            <div class="chart-grid">
              ${[{ t: 'pie', i: I.pie, l: 'Pie' }, { t: 'bar', i: I.bar, l: 'Bar' }, { t: 'line', i: I.line, l: 'Line' }, { t: 'doughnut', i: I.donut, l: 'Donut' }, { t: 'kpi', i: I.kpi, l: 'KPI' }, { t: 'table', i: I.rows, l: 'Table' }]
                .map(c => `<button class="ct-btn ${S.selChart === c.t ? 'sel' : ''}" onclick="selChartType('${c.t}', event)">${c.i}${c.l}</button>`).join('')}
            </div>
          </div>
          <div class="field-g" id="m-label-wrap" style="${showLabel ? '' : 'display:none'}"><label class="flabel" id="m-label-lbl">${labelFieldText(ct)}</label>
            <select class="finput" id="m-label" onchange="handleLabelChange()">${cols.map(c => `<option ${sug?.labelCol === c ? 'selected' : ''}>${escHTML(c)}</option>`).join('')}</select>
          </div>
          <div class="field-g" id="m-value-wrap" style="${showValue ? '' : 'display:none'}"><label class="flabel" id="m-value-lbl">${valueFieldText(ct)}</label>
            <div style="display:flex;gap:6px">
              <select class="finput" id="m-value" style="flex:2" onchange="handleValueChange()">${cols.map((c, i) => `<option ${sug ? (sug.valCol === c ? 'selected' : '') : (i === 1 && cols.length > 1 ? 'selected' : '')}>${escHTML(c)}</option>`).join('')}</select>
              <select class="finput" id="m-agg" onchange="updateModalPreview()" style="flex:1">
                ${['count', 'sum', 'avg', 'min', 'max'].map(a => `<option value="${a}" ${(sug?.agg || 'count') === a ? 'selected' : ''}>${a.toUpperCase()}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div style="width:230px;flex-shrink:0">
          <label class="flabel">Preview</label>
          <div class="modal-preview" id="m-preview-wrap"><canvas id="m-preview-cv" style="width:100%;height:100%"></canvas></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" onclick="saveWidget()">Add to dashboard</button>
        <button class="btn" onclick="closeModal()">Cancel</button>
      </div>`;
    return div;
  }
  return document.createElement('div');
}

export function applyModalFieldVisibility(chartType) {
  const labelWrap = document.getElementById('m-label-wrap');
  const valueWrap = document.getElementById('m-value-wrap');
  const labelLbl = document.getElementById('m-label-lbl');
  const valueLbl = document.getElementById('m-value-lbl');
  if (!labelWrap || !valueWrap) return;
  labelWrap.style.display = ['table', 'kpi'].includes(chartType) ? 'none' : '';
  valueWrap.style.display = chartType === 'table' ? 'none' : '';
  if (labelLbl) labelLbl.textContent = labelFieldText(chartType);
  if (valueLbl) valueLbl.textContent = valueFieldText(chartType);
}

export function renderModalPreview() {
  const wrap = document.getElementById('m-preview-wrap');
  if (!wrap) return;
  const chartType = S.selChart;
  const isPieType = ['pie', 'doughnut'].includes(chartType);
  const labelCol = document.getElementById('m-label')?.value;
  const valCol = document.getElementById('m-value')?.value;
  const agg = document.getElementById('m-agg')?.value || 'count';
  const data = S.curData;

  if (chartType === 'table') {
    const cols = S.curCols;
    wrap.innerHTML = `<div style="width:100%;height:100%;overflow:auto"><table class="rt" style="font-size:10.5px">
      <thead><tr>${cols.map(c => `<th>${escHTML(c)}</th>`).join('')}</tr></thead>
      <tbody>${data.slice(0, 5).map(row => '<tr>' + cols.map(c => `<td>${escHTML(row[c] ?? '')}</td>`).join('') + '</tr>').join('')}</tbody>
    </table></div>`;
    return;
  }
  if (chartType === 'kpi') {
    const vals = data.map(x => Number(x[valCol])).filter(v => !isNaN(v));
    const result = aggregate(agg, vals, data.length);
    const display = Number.isInteger(result) ? result.toLocaleString() : result.toFixed(2);
    wrap.innerHTML = `<div class="kpi-card" style="padding:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div class="kpi-label">${agg.toUpperCase()} (${escHTML(valCol || '')})</div>
      <div class="kpi-value">${display}</div>
      <div class="kpi-sub">${data.length} row${data.length !== 1 ? 's' : ''}</div>
    </div>`;
    return;
  }

  wrap.innerHTML = '<canvas id="m-preview-cv" style="width:100%;height:100%"></canvas>';
  const cv = document.getElementById('m-preview-cv');
  if (!cv || !labelCol || !valCol || !data.length) return;
  const grouped = groupByLabel(data, labelCol, valCol);
  const labels = [...grouped.keys()];
  const values = labels.map(label => {
    const g = grouped.get(label);
    return aggregate(agg, g.values, g.count);
  });
  new Chart(cv, {
    type: chartType,
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: isPieType ? PAL.slice(0, labels.length) : PAL[0],
        borderColor: 'transparent',
        borderRadius: chartType === 'bar' ? 4 : 0,
        tension: 0.4, fill: false, pointRadius: 3,
        borderWidth: chartType === 'line' ? 2 : 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: isPieType, position: 'bottom', labels: { boxWidth: 8, font: { size: 9 }, padding: 6 } },
      },
      scales: isPieType ? {} : {
        x: { ticks: { font: { size: 9 }, maxRotation: 45 }, grid: { color: '#f0f1f3' } },
        y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f0f1f3' } },
      },
    },
  });
}

/* ── CHART ──────────────────────────────────────────── */
function groupByLabel(data, labelCol, valCol) {
  const grouped = new Map();
  data.forEach(row => {
    const key = String(row[labelCol] ?? 'Unknown');
    const val = Number(row[valCol]);
    if (!grouped.has(key)) grouped.set(key, { values: [], count: 0 });
    const g = grouped.get(key);
    g.count++;
    if (!isNaN(val)) g.values.push(val);
  });
  return grouped;
}

export function drawChart(w) {
  const cv = document.getElementById('cv-' + w.id);
  if (!cv) return;
  if (cv._ch) cv._ch.destroy();
  const data = w.data || [];
  const agg = w.agg || 'count';

  // One slice/bar per distinct label value, aggregated — not one per row,
  // otherwise a query with many rows produces an unreadable pie/bar.
  const grouped = groupByLabel(data, w.label_col, w.val_col);
  const labels = [...grouped.keys()];
  const values = labels.map(label => {
    const g = grouped.get(label);
    return aggregate(agg, g.values, g.count);
  });

  const isPie = ['pie', 'doughnut'].includes(w.chart_type);
  const yTitle = `${agg.toUpperCase()}(${w.val_col})`;
  cv._ch = new Chart(cv, {
    type: w.chart_type,
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: isPie ? PAL.slice(0, labels.length) : PAL[0],
        borderColor: 'transparent',
        borderRadius: w.chart_type === 'bar' ? 4 : 0,
        tension: 0.4, fill: false, pointRadius: 4,
        borderWidth: w.chart_type === 'line' ? 2 : 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: isPie, position: 'bottom', labels: { boxWidth: 9, font: { size: 10 }, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label || ''}: ${yTitle} = ${ctx.parsed.y ?? ctx.parsed}` } },
      },
      scales: isPie ? {} : {
        x: {
          title: { display: true, text: w.label_col, font: { size: 12, weight: '600' } },
          grid: { color: '#f0f1f3' }, ticks: { font: { size: 10 }, maxRotation: 45 },
        },
        y: {
          title: { display: true, text: yTitle, font: { size: 12, weight: '600' } },
          grid: { color: '#f0f1f3' }, ticks: { font: { size: 10 } }, beginAtZero: true,
        },
      },
    },
  });
}

export function setSt(txt, state) {
  S.statusText = txt; S.statusState = state;
  const dot = document.querySelector('.status-dot');
  const span = document.querySelector('.statusbar span');
  if (dot) dot.className = 'status-dot' + (state === 'ok' ? ' ok' : state === 'err' ? ' err' : state === 'run' ? ' run' : '');
  if (span) span.textContent = txt;
}
