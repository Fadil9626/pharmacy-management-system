// Shared password strength rule. Returns an error string if the password is too
// weak, or null if it passes. Used by user creation and password resets.
function validatePassword(pw) {
  const s = String(pw || "");
  if (s.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(s)) return "Password must contain at least one letter";
  if (!/[0-9]/.test(s)) return "Password must contain at least one number";
  return null;
}

module.exports = { validatePassword };
