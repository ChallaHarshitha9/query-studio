const express = require('express');
const { pool, userSchema } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_ROWS = 1000;
const STATEMENT_TIMEOUT_MS = 5000;

// Defense-in-depth checks on top of schema isolation (search_path scoping below).
// These block the obvious ways a query could reach outside the caller's own
// schema or the shared read-only demo schema; they are not a substitute for
// running the app's DB role with least privilege in production.
function rejectionReason(sql, ownSchema) {
  const trimmed = sql.trim().replace(/;\s*$/, '');
  if (!trimmed) return 'Query is empty';
  if (trimmed.includes(';')) return 'Only a single SQL statement is allowed';
  if (/\b(pg_catalog|information_schema|pg_[a-z_]+)\b/i.test(trimmed)) {
    return 'Access to system catalogs is not allowed';
  }
  if (/\bapp_users\b/i.test(trimmed)) return 'Access to that table is not allowed';
  const otherSchemaRef = trimmed.match(/\b(user_\d+)\./gi);
  if (otherSchemaRef && otherSchemaRef.some(ref => ref.slice(0, -1).toLowerCase() !== ownSchema)) {
    return 'Cross-account access is not allowed';
  }
  if (/\bdemo\./i.test(trimmed) && !/^\s*select/i.test(trimmed)) {
    return 'Demo data is read-only; only SELECT is allowed against the demo schema';
  }
  return null;
}

router.post('/query', requireAuth, async (req, res) => {
  const sql = String(req.body?.sql || '');
  const schema = userSchema(req.user.id);
  const reason = rejectionReason(sql, schema);
  if (reason) return res.status(400).json({ error: reason });

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await client.query(`SET search_path TO "${schema}", demo`);
    const result = await client.query(sql);
    const rows = (result.rows || []).slice(0, MAX_ROWS);
    res.json({ rows, rowCount: result.rowCount ?? rows.length, truncated: (result.rows || []).length > MAX_ROWS });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    try { await client.query('RESET ALL'); } catch {}
    client.release();
  }
});

module.exports = router;
