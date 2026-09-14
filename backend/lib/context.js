const pool = require("../config/db");

// Who may look at a branch other than their own. The branch switcher is only
// rendered for these roles in the UI — but the UI is not a permission, and this
// is the half that is actually enforced.
const CROSS_BRANCH_ROLES = ["owner", "manager"];

/**
 * The branch a request should act on.
 *
 * X-Branch-Id is the oversight "branch lens": it decides what a read returns
 * and which branch a write lands in. It arrives from the browser, so it is a
 * REQUEST, not a fact — and until this check existed it was obeyed from anyone.
 *
 * Demonstrated before fixing: a cashier whose home branch is 1, sending
 * X-Branch-Id: 2, read the other branch's dashboard — stock value 112,545
 * against their own branch's 49,979. Sending "all" returned the whole chain at
 * 162,524. Nothing in the API had ever checked that the requester was entitled
 * to the branch they named; the branch switcher is simply not drawn for a
 * cashier, and a header costs nothing to set by hand.
 *
 * So the lens is honoured only for roles that are allowed one. Everyone else is
 * pinned to their own branch and the header is ignored rather than refused —
 * refusing would break an ordinary till the moment a stale header was cached,
 * and quietly serving the right branch is both safe and correct.
 */
const effectiveBranch = (req) => {
  const home = (req.user && req.user.branch_id) || null;
  const mayCross = !!(req.user && CROSS_BRANCH_ROLES.includes(req.user.role));

  // Pinned. Nothing the client sends can move a cashier off their own branch.
  if (!mayCross) return home;

  // "all" = explicit cross-branch oversight → no branch filter.
  if (req.headers["x-branch-id"] === "all" || req.query.branch_id === "all") return null;
  return (
    Number(req.headers["x-branch-id"]) ||
    Number(req.query.branch_id) ||
    Number(req.body && req.body.branch_id) ||
    home ||
    null
  );
};

// Is a licensable module switched on? (Pass a pg client to read in a txn.)
async function moduleOn(key, db = pool) {
  const { rows } = await db.query("SELECT is_enabled FROM app_modules WHERE module_key = $1", [key]);
  return rows[0]?.is_enabled === true;
}

module.exports = { effectiveBranch, moduleOn, CROSS_BRANCH_ROLES };
