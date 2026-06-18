require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { runMigrations } = require('./runMigrations');
const authRoutes = require('./routes/auth');
const queryRoutes = require('./routes/query');
const schemaRoutes = require('./routes/schema');
const datasourceRoutes = require('./routes/datasources');
const widgetRoutes = require('./routes/widgets');
const savedQueryRoutes = require('./routes/savedQueries');
const nlToSqlRoutes = require('./routes/nlToSql');
const nlToChartRoutes = require('./routes/nlToChart');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api', queryRoutes);
app.use('/api', schemaRoutes);
app.use('/api', datasourceRoutes);
app.use('/api', widgetRoutes);
app.use('/api', savedQueryRoutes);
app.use('/api', nlToSqlRoutes);
app.use('/api', nlToChartRoutes);

// Forces the browser to revalidate index.html/JS/CSS on every load instead
// of serving a stale cached copy after a deploy (no cache-busting filenames
// are in use, so without this, "the new code isn't showing up" after a
// deploy almost always just means the browser cache, not a failed deploy).
app.use(express.static(path.join(__dirname, '..', '..', 'client'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', '..', 'client', 'index.html'));
});

// Catches Multer upload errors (e.g. file-too-large) and malformed JSON
// bodies so API clients always get a JSON error instead of an HTML page.
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File exceeds the maximum upload size' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;

// Runs schema migrations on every boot so deploys never need manual shell
// access (e.g. Render's free tier has no Shell tab) — all SQL files are
// idempotent (CREATE TABLE IF NOT EXISTS / DROP+CREATE for demo seed data).
runMigrations()
  .then(() => console.log('Migrations applied.'))
  .catch(err => console.error('Migration on boot failed (server will still start):', err.message))
  .finally(() => {
    app.listen(port, () => console.log(`Query Studio server listening on http://localhost:${port}`));
  });
