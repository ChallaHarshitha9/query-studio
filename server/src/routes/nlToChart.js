const express = require('express');
const { userSchema } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getClient, getModel, describeSchema, stripCodeFence, isSingleStatement } = require('../llm');

const router = express.Router();

const VALID_CHARTS = ['bar', 'line', 'pie', 'doughnut', 'kpi', 'table'];
const VALID_AGGS = ['count', 'sum', 'avg', 'min', 'max'];

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

router.post('/nl-to-chart', requireAuth, async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Describe the chart you want first' });

  const openai = getClient();
  if (!openai) {
    return res.status(503).json({ error: 'Text-to-chart is not configured on this server (missing GITHUB_TOKEN)' });
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
            'You design a single dashboard chart from a plain-English request, for the ' +
            'PostgreSQL tables listed below.\n' +
            'Respond with ONLY a JSON object — no markdown code fences, no explanation — with ' +
            'exactly these keys:\n' +
            '{\n' +
            '  "sql": single PostgreSQL SELECT statement the chart data comes from,\n' +
            '  "name": short widget title,\n' +
            '  "chartType": one of "bar", "line", "pie", "doughnut", "kpi", "table",\n' +
            '  "labelCol": the column from the SELECT result used as category/X-axis, or null for kpi/table,\n' +
            '  "valCol": the column from the SELECT result used as the metric/Y-axis,\n' +
            '  "agg": one of "count", "sum", "avg", "min", "max" — how rows sharing a label get combined\n' +
            '}\n' +
            'The sql value must be a single SELECT only — never INSERT/UPDATE/DELETE/DDL for this feature.\n' +
            'Only reference the tables and columns listed below; never invent column or table names.\n' +
            'labelCol and valCol must be column names that actually appear in the SELECT result ' +
            '(an output alias is fine, e.g. an aliased COUNT(*) AS total_count).\n' +
            'Prefer "pie" or "doughnut" only when the result has roughly 8 or fewer categories; use ' +
            '"bar" for more categories, "line" when the label column is a date/time, and "kpi" when ' +
            'the request wants a single overall number rather than a breakdown.\n\n' +
            'Available tables:\n' + (schemaText || '(none yet)'),
        },
        { role: 'user', content: prompt },
      ],
    });

    const raw = stripCodeFence(completion.choices?.[0]?.message?.content || '');
    const parsed = parseJsonLoose(raw);
    if (!parsed) {
      return res.status(422).json({ error: 'Model did not return valid chart JSON — try rephrasing your request.' });
    }

    let { sql, name, chartType, labelCol, valCol, agg } = parsed;
    sql = stripCodeFence(String(sql || ''));

    if (!sql) {
      return res.status(422).json({ error: 'Model did not return a query — try rephrasing your request.' });
    }
    if (!/^select\b/i.test(sql)) {
      return res.status(422).json({ error: 'Generated chart query must be a SELECT statement — try rephrasing your request.' });
    }
    if (!isSingleStatement(sql)) {
      return res.status(422).json({ error: 'Generated query contained multiple statements — try rephrasing your request.' });
    }

    chartType = VALID_CHARTS.includes(chartType) ? chartType : 'bar';
    agg = VALID_AGGS.includes(agg) ? agg : 'count';
    name = String(name || prompt).trim().slice(0, 120) || 'Untitled widget';
    labelCol = labelCol ? String(labelCol) : null;
    valCol = valCol ? String(valCol) : null;

    res.json({ sql, name, chartType, labelCol, valCol, agg });
  } catch (err) {
    res.status(500).json({ error: 'Text-to-chart failed: ' + err.message });
  }
});

module.exports = router;
