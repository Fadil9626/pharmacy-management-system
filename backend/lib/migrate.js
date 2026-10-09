const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "migrations");

/**
 * Apply the database updates in migrations/, each once, in order.
 *
 * They used to run, every one of them, on every start — and a failure was
 * written to the log and then ignored, so the app came up on a database that
 * was missing whatever the failed file created, and failed later somewhere
 * unrelated. Now each file runs inside a transaction, is recorded in
 * schema_migrations, and a failure stops here with the file's name.
 *
 * An install from before this has no record of anything, so the first run
 * applies every file once more. They were already re-run on every start, so
 * each is safe to repeat.
 *
 * Used at start-up (server.js) and by `npm run migrate` (the updater's step).
 */
async function migrate(pool, log = console.log) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const done = new Set((await pool.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(path.join(DIR, f), "utf8"));
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [f]);
      await client.query("COMMIT");
      applied++;
      log(`✅ migration ${f}`);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`database update ${f} failed: ${e.message}`);
    } finally {
      client.release();
    }
  }
  return { applied, total: files.length };
}

module.exports = { migrate };
