const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function userSchema(userId) {
  return `user_${Number(userId)}`;
}

module.exports = { pool, userSchema };
