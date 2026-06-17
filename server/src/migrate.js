require('dotenv').config();
const { pool } = require('./db');
const { runMigrations } = require('./runMigrations');

runMigrations()
  .then(async () => {
    console.log('Migration complete.');
    await pool.end();
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
