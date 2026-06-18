const express = require('express');
const OpenAI = require('openai');
const { pool, userSchema } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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

router.post('/nl-to-sql', requireAuth, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Describe what you want first' });

  const openai = getClient();
  if (!openai) {
    return res.status(503).json({ error: 'Text-to-SQL is not configured on this server (missing GITHUB_TOKEN)' });
  }

  try {
    const schemaText = await describeSchema(userSchema(req.user.id));

    const completion = await openai.chat.completions.create({
      model: process.env.GITHUB_MODEL || 'openai/gpt-4o-mini',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'You translate plain-English requests into a single PostgreSQL statement — ' +
            'SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, or any other valid ' +
            'statement, whichever matches what is being asked.\n' +
            'Only reference the tables and columns listed below; never invent column or table names.\n' +
            'Write exactly ONE statement — never separate multiple statements with semicolons.\n' +
            'Respond with ONLY the raw SQL — no markdown code fences, no explanation.\n\n' +
            'Available tables:\n' + (schemaText || '(none yet)'),
        },
        { role: 'user', content: prompt },
      ],
    });

    let sql = (completion.choices?.[0]?.message?.content || '').trim();
    sql = sql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    if (!sql) {
      return res.status(422).json({ error: 'Model returned an empty query — try rephrasing your request.' });
    }
    if (sql.replace(/;\s*$/, '').includes(';')) {
      return res.status(422).json({ error: 'Generated query contained multiple statements — try rephrasing your request.' });
    }

    res.json({ sql });
  } catch (err) {
    res.status(500).json({ error: 'Text-to-SQL failed: ' + err.message });
  }
});

module.exports = router;
