const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const VALID_AGGS = ['count', 'sum', 'avg', 'min', 'max'];

router.get('/widgets', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, chart_type, sql_text, label_col, val_col, agg, data, created_at FROM widgets WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json({ widgets: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/widgets', requireAuth, async (req, res) => {
  const { name, chartType, sqlText, labelCol, valCol, agg, data } = req.body || {};
  if (!name || !chartType || !sqlText) {
    return res.status(400).json({ error: 'name, chartType, and sqlText are required' });
  }
  const aggValue = VALID_AGGS.includes(agg) ? agg : 'count';
  try {
    const result = await pool.query(
      `INSERT INTO widgets (user_id, name, chart_type, sql_text, label_col, val_col, agg, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, chart_type, sql_text, label_col, val_col, agg, data, created_at`,
      [req.user.id, name, chartType, sqlText, labelCol || null, valCol || null, aggValue, JSON.stringify(Array.isArray(data) ? data : [])]
    );
    res.status(201).json({ widget: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/widgets/:id', requireAuth, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await pool.query(
      `UPDATE widgets SET name = $1 WHERE id = $2 AND user_id = $3
       RETURNING id, name, chart_type, sql_text, label_col, val_col, agg, created_at`,
      [name.trim(), req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Widget not found' });
    res.json({ widget: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/widgets/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM widgets WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Widget not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/widgets', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM widgets WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
