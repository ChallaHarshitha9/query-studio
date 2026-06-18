const OpenAI = require('openai');
const { pool } = require('./db');

let client = null;
function getClient() {
  if (!process.env.GITHUB_TOKEN) return null;
  if (!client) {
    client = new OpenAI({
      baseURL: 'https://models.github.ai/inference',
      apiKey: process.env.GITHUB_TOKEN,
    });
  }
  return client;
}

function getModel() {
  return process.env.GITHUB_MODEL || 'openai/gpt-4o-mini';
}

async function describeSchema(schema) {
  const result = await pool.query(
    `SELECT table_schema, table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema IN ($1, 'demo')
     ORDER BY (table_schema = 'demo'), table_name, ordinal_position`,
    [schema]
  );
  const tables = new Map();
  for (const row of result.rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, []);
    tables.get(row.table_name).push(`${row.column_name} ${row.data_type}`);
  }
  return [...tables.entries()].map(([t, cols]) => `${t}(${cols.join(', ')})`).join('\n');
}

function stripCodeFence(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json|sql)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

// Finds the matching closing paren for the first "(" at/after fromIndex,
// respecting nested parens and quoted strings (so values like 'a, b' or a
// nested NOW() don't get miscounted as separate items or extra groups).
function extractParenGroup(str, fromIndex) {
  const open = str.indexOf('(', fromIndex);
  if (open === -1) return null;
  let depth = 0, inStr = false, strCh = '';
  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (ch === strCh && str[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (ch === "'" || ch === '"') { inStr = true; strCh = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) return { content: str.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

function splitTopLevel(str) {
  const parts = [];
  let depth = 0, inStr = false, strCh = '', current = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      current += ch;
      if (ch === strCh && str[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (ch === "'" || ch === '"') { inStr = true; strCh = ch; current += ch; continue; }
    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map(p => p.trim()).filter(Boolean);
}

// Catches the most common way the model gets an INSERT wrong: an explicit
// column list whose length doesn't match the VALUES tuple right after it.
// Only checks the first row of a multi-row VALUES list.
function checkInsertColumnCount(sql) {
  if (!/^insert\s+into/i.test(sql)) return null;
  const colsGroup = extractParenGroup(sql, 0);
  if (!colsGroup) return null; // no explicit column list given — nothing to compare
  const valuesIdx = sql.toLowerCase().indexOf('values', colsGroup.end);
  if (valuesIdx === -1) return null;
  const valsGroup = extractParenGroup(sql, valuesIdx);
  if (!valsGroup) return null;
  const cols = splitTopLevel(colsGroup.content);
  const vals = splitTopLevel(valsGroup.content);
  if (cols.length !== vals.length) {
    return `Generated INSERT lists ${cols.length} column(s) but ${vals.length} value(s) — try rephrasing your request.`;
  }
  return null;
}

function isSingleStatement(sql) {
  return !sql.replace(/;\s*$/, '').includes(';');
}

module.exports = {
  getClient,
  getModel,
  describeSchema,
  stripCodeFence,
  checkInsertColumnCount,
  isSingleStatement,
};
