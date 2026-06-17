require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const queryRoutes = require('./routes/query');
const schemaRoutes = require('./routes/schema');
const datasourceRoutes = require('./routes/datasources');
const widgetRoutes = require('./routes/widgets');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api', queryRoutes);
app.use('/api', schemaRoutes);
app.use('/api', datasourceRoutes);
app.use('/api', widgetRoutes);

app.use(express.static(path.join(__dirname, '..', '..', 'client')));
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
app.listen(port, () => console.log(`Query Studio server listening on http://localhost:${port}`));
