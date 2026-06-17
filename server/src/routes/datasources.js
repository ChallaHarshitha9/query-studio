const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const { pool, userSchema } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const MAX_MB = 20;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024 } });

function sanitizeIdent(name, fallbackPrefix) {
  let s = name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^\d/.test(s)) s = `${fallbackPrefix}_${s}`;
  return s.toLowerCase();
}

router.get('/datasources', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, table_name, original_filename, row_count, size_bytes, created_at FROM datasources WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ datasources: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/datasources/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const rawName = req.file.originalname.replace(/\.(csv|tsv|txt)$/i, '');
  const tableName = sanitizeIdent(rawName, 't');
  const text = req.file.buffer.toString('utf8');

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => sanitizeIdent(h, 'c'),
  });

  if (parsed.errors.length && !parsed.data.length) {
    return res.status(400).json({ error: 'Could not parse file: ' + parsed.errors[0].message });
  }
  if (!parsed.data.length) {
    return res.status(400).json({ error: 'File appears empty or has no data rows' });
  }

  const cols = Object.keys(parsed.data[0]);
  const colDefs = cols.map(c => {
    const vals = parsed.data.map(r => r[c]).filter(v => v !== '' && v !== null && v !== undefined);
    const allNum = vals.length > 0 && vals.every(v => v !== '' && !isNaN(Number(v)));
    return { name: c, type: allNum ? 'DOUBLE PRECISION' : 'TEXT' };
  });

  const schema = userSchema(req.user.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS "${schema}"."${tableName}"`);
    await client.query(
      `CREATE TABLE "${schema}"."${tableName}" (${colDefs.map(c => `"${c.name}" ${c.type}`).join(', ')})`
    );

    const placeholders = colDefs.map((_, i) => `$${i + 1}`).join(',');
    const insertSql = `INSERT INTO "${schema}"."${tableName}" VALUES (${placeholders})`;
    for (const row of parsed.data) {
      const values = colDefs.map(c => {
        const v = row[c.name];
        if (v === '' || v === null || v === undefined) return null;
        return c.type === 'DOUBLE PRECISION' ? Number(v) : String(v);
      });
      await client.query(insertSql, values);
    }

    await client.query(
      `INSERT INTO datasources (user_id, table_name, original_filename, row_count, size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, table_name) DO UPDATE
         SET original_filename = EXCLUDED.original_filename,
             row_count = EXCLUDED.row_count,
             size_bytes = EXCLUDED.size_bytes,
             created_at = now()`,
      [req.user.id, tableName, req.file.originalname, parsed.data.length, req.file.size]
    );

    await client.query('COMMIT');
    res.status(201).json({ tableName, rowCount: parsed.data.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: 'Upload failed: ' + err.message });
  } finally {
    client.release();
  }
});

router.get('/datasources/:id/download', requireAuth, async (req, res) => {
  const schema = userSchema(req.user.id);
  try {
    const found = await pool.query(
      'SELECT table_name, original_filename FROM datasources WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!found.rows.length) return res.status(404).json({ error: 'Datasource not found' });
    const { table_name: tableName, original_filename: originalFilename } = found.rows[0];

    const data = await pool.query(`SELECT * FROM "${schema}"."${tableName}"`);
    const csv = Papa.unparse({ fields: data.fields.map(f => f.name), data: data.rows });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${originalFilename || tableName + '.csv'}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/datasources/:id', requireAuth, async (req, res) => {
  const schema = userSchema(req.user.id);
  const client = await pool.connect();
  try {
    const found = await client.query(
      'SELECT table_name FROM datasources WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!found.rows.length) return res.status(404).json({ error: 'Datasource not found' });

    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS "${schema}"."${found.rows[0].table_name}"`);
    await client.query('DELETE FROM datasources WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
