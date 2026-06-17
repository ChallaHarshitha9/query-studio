const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/saved-queries', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, sql_text, created_at FROM saved_queries WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ savedQueries: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/saved-queries', requireAuth, async (req, res) => {
  const { name, sqlText } = req.body || {};
  if (!name || !sqlText) return res.status(400).json({ error: 'name and sqlText are required' });
  try {
    const result = await pool.query(
      'INSERT INTO saved_queries (user_id, name, sql_text) VALUES ($1, $2, $3) RETURNING id, name, sql_text, created_at',
      [req.user.id, name, sqlText]
    );
    res.status(201).json({ savedQuery: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/saved-queries/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM saved_queries WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Saved query not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
