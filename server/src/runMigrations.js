const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function runMigrations() {
  const sqlDir = path.join(__dirname, 'sql');
  const files = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
    await pool.query(sql);
    console.log(`Applied ${file}`);
  }
}

module.exports = { runMigrations };
