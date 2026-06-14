const pool = require("../config/db");

// The branch a request should act on. The frontend sends X-Branch-Id (the
// oversight "branch lens"); writes use it so stock never lands in a sister
// branch by accident. Falls back to explicit params, then the user's home branch.
const effectiveBranch = (req) =>
  Number(req.headers["x-branch-id"]) ||
  Number(req.query.branch_id) ||
  Number(req.body && req.body.branch_id) ||
  (req.user && req.user.branch_id) ||
  null;

// Is a licensable module switched on? (Pass a pg client to read in a txn.)
async function moduleOn(key, db = pool) {
  const { rows } = await db.query("SELECT is_enabled FROM app_modules WHERE module_key = $1", [key]);
  return rows[0]?.is_enabled === true;
}

module.exports = { effectiveBranch, moduleOn };
