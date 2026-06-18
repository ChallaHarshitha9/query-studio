const express = require('express');
const { userSchema } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getClient, getModel, describeSchema, stripCodeFence, checkInsertColumnCount, isSingleStatement } = require('../llm');

const router = express.Router();

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
      model: getModel(),
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
            'For INSERT statements: always write out the column list explicitly in parentheses ' +
            'right after the table name, then provide exactly one value per listed column, in the ' +
            'same order. Before responding, count the column list and the value list and make sure ' +
            'they are exactly equal — this is the most common mistake, avoid it.\n' +
            'Respond with ONLY the raw SQL — no markdown code fences, no explanation.\n\n' +
            'Available tables:\n' + (schemaText || '(none yet)'),
        },
        { role: 'user', content: prompt },
      ],
    });

    const sql = stripCodeFence(completion.choices?.[0]?.message?.content || '');

    if (!sql) {
      return res.status(422).json({ error: 'Model returned an empty query — try rephrasing your request.' });
    }
    if (!isSingleStatement(sql)) {
      return res.status(422).json({ error: 'Generated query contained multiple statements — try rephrasing your request.' });
    }
    const insertErr = checkInsertColumnCount(sql);
    if (insertErr) return res.status(422).json({ error: insertErr });

    res.json({ sql });
  } catch (err) {
    res.status(500).json({ error: 'Text-to-SQL failed: ' + err.message });
  }
});

module.exports = router;
