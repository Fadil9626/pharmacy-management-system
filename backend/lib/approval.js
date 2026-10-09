const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { userCan } = require("./permissions");
const loginGuard = require("./loginGuard");

/**
 * A second person for the actions that move money or stock out of sight:
 * refunds, cash paid out of the till, write-offs and stock-count differences
 * above the amounts set in Settings → Approvals (0 = no approval needed).
 *
 * At a pharmacy counter the approver is standing there, so it works the way a
 * till supervisor override does: the request carries `approval: { email,
 * password }` — the approver signs in on the same screen. A manager or owner
 * with the same permission, who is not the person making the request.
 *
 * Without an approval the request is refused with code APPROVAL_REQUIRED and
 * the website asks for one, then sends the request again.
 */
class ApprovalError extends Error {
  constructor(message, code = "APPROVAL_REQUIRED") {
    super(message);
    this.status = 403;
    this.code = code;
  }
}

const APPROVER_ROLES = ["owner", "manager"];

async function rule(column) {
  const s = (await pool.query(`SELECT ${column} AS v FROM settings WHERE id = 1`)).rows[0];
  return Number(s?.v) || 0;
}

/**
 * @param req        the request (req.body.approval is read)
 * @param column     the settings column with the limit, e.g. "approve_refund_over"
 * @param amount     the size of this action, in the limit's units
 * @param permission what the approver must also be allowed to do
 * @param what       how the action is described to the person asked to approve
 * @returns the approver's { id, full_name }, or null when no approval is needed
 * @throws ApprovalError
 */
async function requireApproval(req, { column, amount, permission, what }) {
  const limit = await rule(column);
  if (!(limit > 0) || Math.abs(amount) < limit) return null;

  const a = req.body?.approval;
  if (!a || !a.email || !a.password) {
    throw new ApprovalError(`${what} needs a manager's approval`);
  }
  const wait = loginGuard.retryAfter(req, a.email);
  if (wait > 0) throw new ApprovalError(`Too many attempts. Try again in ${Math.ceil(wait / 60)} min.`, "APPROVAL_LOCKED");
  const u = (await pool.query(
    "SELECT id, full_name, role, is_active, password_hash FROM users WHERE lower(email) = lower($1)", [a.email]
  )).rows[0];
  const ok = u && u.is_active && (await bcrypt.compare(String(a.password), u.password_hash));
  if (!ok) {
    loginGuard.recordFail(req, a.email);
    throw new ApprovalError("That approval sign-in is wrong", "APPROVAL_INVALID");
  }
  loginGuard.reset(req, a.email);
  if (u.id === req.user.id) throw new ApprovalError("Someone else has to approve this", "APPROVAL_INVALID");
  if (!APPROVER_ROLES.includes(u.role) || !(await userCan(u.role, permission))) {
    throw new ApprovalError(`${u.full_name} can't approve this — ask a manager`, "APPROVAL_INVALID");
  }
  return { id: u.id, full_name: u.full_name };
}

/** Answer an ApprovalError the way the website expects. */
function sendApprovalError(res, e) {
  return res.status(403).json({ message: e.message, code: e.code });
}

module.exports = { requireApproval, ApprovalError, sendApprovalError };
