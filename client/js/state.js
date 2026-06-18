export const PAL = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#0d9488'];
export const MAX_MB = 20;

export const S = {
  // auth
  authed: false,
  user: null,
  authMode: 'login', // 'login' | 'signup'
  authErr: '',
  authBusy: false,

  // nav
  page: 'builder',
  modal: null,

  // schema / data sources
  activeSchema: {},
  schemaOpen: {},
  uploadedFiles: [], // [{id, table_name, original_filename, row_count, size_bytes}]
  connBadge: 'Loading data sources...',
  connTag: 'connecting',
  connMode: 'demo',

  // query builder
  isVisual: false,
  sqlText: 'SELECT severity, COUNT(*) AS total\nFROM gnn_alerts\nGROUP BY severity\nORDER BY total DESC',
  curData: [],
  curCols: [],
  statusText: 'Ready',
  statusState: 'idle',
  vSel: 'severity, COUNT(*) AS total',
  vFrom: 'gnn_alerts', vWhere: '', vGrp: 'severity', vOrd: 'total DESC', vLim: '10',

  // dashboard
  widgets: [], // [{id, name, chart_type, sql_text, label_col, val_col, data, cols}]
  selChart: 'bar',
  autoRefresh: false,
  dashboardUpdatedAt: null,

  // saved queries (distinct from widgets — just a name + SQL text to reload later)
  savedQueries: [], // [{id, name, sql_text, created_at}]

  // AI-suggested widget config pending review in the save modal
  pendingChartSuggestion: null, // {name, labelCol, valCol, agg} set by generateChart()
};
