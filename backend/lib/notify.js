const pool = require("../config/db");

// Provider-agnostic notifications. Every message is recorded in the outbox; if a
// matching channel API is configured in settings.notify_config it is also POSTed
// to that provider (Twilio/Africa's Talking/SendGrid/Mailgun-style — any gateway
// that accepts a JSON webhook). No external dependency: uses Node's global fetch.
//
// notify_config shape:
//   {
//     email: { enabled, api_url, api_key, from },
//     sms:   { enabled, api_url, api_key, sender },
//     events: { low_stock, near_expiry, refill_due },
//     recipients: { emails: [], phones: [] },   // ops-alert targets
//     dedupe_hours: 12
//   }

async function getConfig() {
  const { rows } = await pool.query("SELECT notify_config FROM settings WHERE id = 1");
  return rows[0]?.notify_config || {};
}

// Has a message of this type for this ref gone out within `hours`? Stops alert spam.
async function recentlyNotified(type, refId, hours) {
  if (!hours || hours <= 0) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM notifications
     WHERE type = $1 AND ref_id IS NOT DISTINCT FROM $2
       AND created_at > NOW() - ($3 || ' hours')::interval
     LIMIT 1`,
    [type, refId ?? null, String(hours)]
  );
  return rows.length > 0;
}

async function deliver(channel, cfg, { to, subject, body }) {
  const c = (cfg && cfg[channel]) || {};
  if (!c.enabled) return { status: "logged", error: null };

  // Email over SMTP (e.g. Gmail app password) takes precedence when configured.
  if (channel === "email" && c.smtp_host && c.smtp_user && c.smtp_pass) {
    try {
      const nodemailer = require("nodemailer");
      const port = Number(c.smtp_port) || 587;
      const transporter = nodemailer.createTransport({
        host: c.smtp_host,
        port,
        secure: c.smtp_secure != null ? !!c.smtp_secure : port === 465,
        auth: { user: c.smtp_user, pass: c.smtp_pass },
      });
      await transporter.sendMail({ from: c.from || c.smtp_user, to, subject, text: body });
      return { status: "sent", error: null };
    } catch (e) {
      return { status: "failed", error: e.message };
    }
  }

  // Otherwise, an HTTP provider API (Resend-style JSON webhook).
  if (!c.api_url) return { status: "logged", error: null };
  try {
    const payload =
      channel === "email"
        ? { to, from: c.from || undefined, subject, text: body }
        : { to, sender: c.sender || undefined, message: body };
    const res = await fetch(c.api_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.api_key ? { Authorization: `Bearer ${c.api_key}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { status: "failed", error: `Provider responded ${res.status}` };
    return { status: "sent", error: null };
  } catch (e) {
    return { status: "failed", error: e.message };
  }
}

// Record + (best-effort) send one message. Returns the stored row.
async function notify({ channel, to, type, subject, body, ref_type, ref_id }, cfg) {
  const config = cfg || (await getConfig());
  const { status, error } = await deliver(channel, config, { to, subject, body });
  const { rows } = await pool.query(
    `INSERT INTO notifications (channel, recipient, type, subject, body, status, error, ref_type, ref_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [channel, to || null, type, subject || null, body || null, status, error, ref_type || null, ref_id ?? null]
  );
  return rows[0];
}

module.exports = { notify, getConfig, recentlyNotified };
