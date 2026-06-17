const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/widgets', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, chart_type, sql_text, label_col, val_col, created_at FROM widgets WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json({ widgets: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/widgets', requireAuth, async (req, res) => {
  const { name, chartType, sqlText, labelCol, valCol } = req.body || {};
  if (!name || !chartType || !sqlText) {
    return res.status(400).json({ error: 'name, chartType, and sqlText are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO widgets (user_id, name, chart_type, sql_text, label_col, val_col)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, chart_type, sql_text, label_col, val_col, created_at`,
      [req.user.id, name, chartType, sqlText, labelCol || null, valCol || null]
    );
    res.status(201).json({ widget: result.rows[0] });
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
