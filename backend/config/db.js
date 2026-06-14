const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

pool.on("error", (err) => console.error("Unexpected PG error:", err.message));

module.exports = pool;
