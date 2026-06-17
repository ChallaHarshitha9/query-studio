const express = require('express');
const { pool, userSchema } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/schema', requireAuth, async (req, res) => {
  const schema = userSchema(req.user.id);
  try {
    const result = await pool.query(
      `SELECT table_schema, table_name, column_name, data_type, ordinal_position
       FROM information_schema.columns
       WHERE table_schema IN ($1, 'demo')
       ORDER BY (table_schema = 'demo'), table_name, ordinal_position`,
      [schema]
    );

    // Own-schema rows are ordered first; if a name collides with a demo
    // table, the user's table shadows it here (matching search_path order).
    const tableOwner = {};
    const tables = {};
    for (const row of result.rows) {
      const owner = row.table_schema === 'demo' ? 'demo' : 'own';
      if (tableOwner[row.table_name] && tableOwner[row.table_name] !== owner) continue;
      tableOwner[row.table_name] = owner;
      (tables[row.table_name] ??= []).push({ n: row.column_name, t: row.data_type });
    }
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
