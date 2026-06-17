require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'sql', '001_init.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migration complete: app_users, widgets, datasources, demo.* seeded.');
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
