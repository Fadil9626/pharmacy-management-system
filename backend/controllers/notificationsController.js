const pool = require("../config/db");
const { logAudit } = require("../lib/audit");
const { notify, getConfig, recentlyNotified } = require("../lib/notify");

const DEFAULTS = {
  email: { enabled: false, api_url: "", api_key: "", from: "", smtp_host: "", smtp_port: 587, smtp_user: "", smtp_pass: "", smtp_secure: false },
  sms: { enabled: false, api_url: "", api_key: "", sender: "" },
  events: { low_stock: true, near_expiry: true, refill_due: true },
  recipients: { emails: [], phones: [] },
  dedupe_hours: 12,
};

const merge = (base, over) => ({ ...base, ...(over || {}) });
function withDefaults(cfg) {
  const c = cfg || {};
  return {
    email: merge(DEFAULTS.email, c.email),
    sms: merge(DEFAULTS.sms, c.sms),
    events: merge(DEFAULTS.events, c.events),
    recipients: merge(DEFAULTS.recipients, c.recipients),
    dedupe_hours: c.dedupe_hours != null ? c.dedupe_hours : DEFAULTS.dedupe_hours,
  };
}

// Never leak provider secrets to the client — return a "*_key_set" flag instead.
exports.getConfig = async (_req, res) => {
  try {
    const cfg = withDefaults(await getConfig());
    res.json({
      email: { enabled: cfg.email.enabled, api_url: cfg.email.api_url, from: cfg.email.from, api_key_set: !!cfg.email.api_key,
               smtp_host: cfg.email.smtp_host, smtp_port: cfg.email.smtp_port, smtp_user: cfg.email.smtp_user, smtp_secure: !!cfg.email.smtp_secure, smtp_pass_set: !!cfg.email.smtp_pass },
      sms: { enabled: cfg.sms.enabled, api_url: cfg.sms.api_url, sender: cfg.sms.sender, api_key_set: !!cfg.sms.api_key },
      events: cfg.events,
      recipients: cfg.recipients,
      dedupe_hours: cfg.dedupe_hours,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Save config. A blank api_key keeps the stored one (so the masked form doesn't
// wipe secrets on every save).
exports.saveConfig = async (req, res) => {
  try {
    const cur = withDefaults(await getConfig());
    const b = req.body || {};
    const next = withDefaults({
      email: {
        enabled: !!b.email?.enabled,
        api_url: b.email?.api_url ?? cur.email.api_url,
        from: b.email?.from ?? cur.email.from,
        api_key: b.email?.api_key ? b.email.api_key : cur.email.api_key,
        smtp_host: b.email?.smtp_host ?? cur.email.smtp_host,
        smtp_port: b.email?.smtp_port != null ? Number(b.email.smtp_port) : cur.email.smtp_port,
        smtp_user: b.email?.smtp_user ?? cur.email.smtp_user,
        smtp_pass: b.email?.smtp_pass ? b.email.smtp_pass : cur.email.smtp_pass,
        smtp_secure: b.email?.smtp_secure != null ? !!b.email.smtp_secure : cur.email.smtp_secure,
      },
      sms: {
        enabled: !!b.sms?.enabled,
        api_url: b.sms?.api_url ?? cur.sms.api_url,
        sender: b.sms?.sender ?? cur.sms.sender,
        api_key: b.sms?.api_key ? b.sms.api_key : cur.sms.api_key,
      },
      events: b.events ?? cur.events,
      recipients: {
        emails: Array.isArray(b.recipients?.emails) ? b.recipients.emails.filter(Boolean) : cur.recipients.emails,
        phones: Array.isArray(b.recipients?.phones) ? b.recipients.phones.filter(Boolean) : cur.recipients.phones,
      },
      dedupe_hours: b.dedupe_hours != null ? Number(b.dedupe_hours) : cur.dedupe_hours,
    });
    await pool.query("UPDATE settings SET notify_config = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify(next)]);
    logAudit(req, "notify_config_update", "settings", 1, { email: next.email.enabled, sms: next.sms.enabled });
    exports.getConfig(req, res);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.list = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, channel, recipient, type, subject, status, error, created_at
       FROM notifications ORDER BY created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Send a one-off test message to confirm a channel is wired up.
exports.test = async (req, res) => {
  const { channel, to } = req.body || {};
  if (!["email", "sms"].includes(channel)) return res.status(400).json({ message: "channel must be email or sms" });
  if (!to) return res.status(400).json({ message: "Enter a recipient to test" });
  try {
    const row = await notify({
      channel, to, type: "test",
      subject: "Remedy test notification",
      body: "This is a test notification from Remedy. If you received it, your channel is configured correctly.",
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Recipients for ops alerts — configured list, else fall back to the pharmacy's
// own email/phone so alerts are demoable out of the box.
async function opsRecipients(cfg) {
  const s = await pool.query("SELECT email, phone FROM settings WHERE id = 1");
  const emails = cfg.recipients.emails.length ? cfg.recipients.emails : [s.rows[0]?.email].filter(Boolean);
  const phones = cfg.recipients.phones.length ? cfg.recipients.phones : [s.rows[0]?.phone].filter(Boolean);
  return { emails, phones };
}

async function fanout(cfg, { type, subject, body, ref_id }) {
  const { emails, phones } = await opsRecipients(cfg);
  const sent = [];
  if (cfg.email.enabled || emails.length) for (const to of emails) sent.push(await notify({ channel: "email", to, type, subject, body, ref_id }, cfg));
  if (cfg.sms.enabled || phones.length) for (const to of phones) sent.push(await notify({ channel: "sms", to, type, subject, body, ref_id }, cfg));
  return sent.length;
}

// Scan for alert conditions and emit (deduped) notifications. Call manually from
// the UI, or schedule via cron, e.g. hourly:
//   curl -s -XPOST http://127.0.0.1:5190/api/notifications/run-alerts -H "Authorization: Bearer <svc-token>"
exports.runAlerts = async (req, res) => {
  try {
    const cfg = withDefaults(await getConfig());
    const dh = cfg.dedupe_hours;
    const settings = (await pool.query("SELECT near_expiry_months FROM settings WHERE id = 1")).rows[0] || {};
    const months = Number(settings.near_expiry_months) || 3;
    const result = { low_stock: 0, near_expiry: 0, refill_due: 0, sent: 0 };

    // 1) Low stock — products at/below reorder level (non-expired stock, all branches).
    if (cfg.events.low_stock && !(await recentlyNotified("low_stock", null, dh))) {
      const low = await pool.query(
        `SELECT p.name, p.reorder_level,
                COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0)::int AS stock
         FROM products p LEFT JOIN product_batches b ON b.product_id = p.id
         WHERE p.is_active = true
         GROUP BY p.id, p.name, p.reorder_level
         HAVING COALESCE(SUM(b.quantity) FILTER (WHERE b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE), 0) <= p.reorder_level
         ORDER BY stock ASC LIMIT 50`
      );
      if (low.rows.length) {
        result.low_stock = low.rows.length;
        const body = `Low / out of stock (${low.rows.length}):\n` +
          low.rows.map((r) => `• ${r.name}: ${r.stock} on hand (reorder at ${r.reorder_level})`).join("\n");
        result.sent += await fanout(cfg, { type: "low_stock", subject: `Low stock: ${low.rows.length} item(s)`, body });
      }
    }

    // 2) Near expiry — batches expiring within the configured window.
    if (cfg.events.near_expiry && !(await recentlyNotified("near_expiry", null, dh))) {
      const exp = await pool.query(
        `SELECT p.name, b.batch_no, b.quantity, b.expiry_date
         FROM product_batches b JOIN products p ON b.product_id = p.id
         WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL
           AND b.expiry_date <= (CURRENT_DATE + ($1 || ' months')::interval)
         ORDER BY b.expiry_date ASC LIMIT 50`,
        [String(months)]
      );
      if (exp.rows.length) {
        result.near_expiry = exp.rows.length;
        const body = `Expiring within ${months} month(s) (${exp.rows.length} batch(es)):\n` +
          exp.rows.map((r) => `• ${r.name}${r.batch_no ? ` [${r.batch_no}]` : ""}: ${r.quantity} units, exp ${new Date(r.expiry_date).toISOString().slice(0, 10)}`).join("\n");
        result.sent += await fanout(cfg, { type: "near_expiry", subject: `Expiry alert: ${exp.rows.length} batch(es)`, body });
      }
    }

    // 3) Refill due — repeat prescriptions with refills left, last dispensed 30+
    // days ago, and a customer we can reach. Notifies the customer directly.
    if (cfg.events.refill_due) {
      const rx = await pool.query(
        `SELECT pr.id, pr.rx_number, pr.patient_name, pr.refills_allowed, pr.refills_used,
                c.name AS customer, c.email, c.phone
         FROM prescriptions pr JOIN customers c ON pr.customer_id = c.id
         WHERE pr.status = 'dispensed' AND pr.refills_allowed > pr.refills_used
           AND pr.dispensed_at IS NOT NULL AND pr.dispensed_at <= NOW() - INTERVAL '30 days'
           AND (c.email IS NOT NULL OR c.phone IS NOT NULL)
         ORDER BY pr.dispensed_at ASC LIMIT 100`
      ).catch(() => ({ rows: [] }));
      for (const r of rx.rows) {
        if (await recentlyNotified("refill_due", r.id, 24 * 20)) continue; // ~once per 20 days per Rx
        const subject = `Prescription refill reminder (${r.rx_number})`;
        const body = `Hello ${r.customer || r.patient_name || "there"}, your prescription ${r.rx_number} is due for a refill (${r.refills_allowed - r.refills_used} refill(s) remaining). Please visit the pharmacy.`;
        if (cfg.email.enabled || r.email) if (r.email) { await notify({ channel: "email", to: r.email, type: "refill_due", subject, body, ref_type: "prescription", ref_id: r.id }, cfg); result.sent++; }
        if (cfg.sms.enabled || r.phone) if (r.phone) { await notify({ channel: "sms", to: r.phone, type: "refill_due", subject, body, ref_type: "prescription", ref_id: r.id }, cfg); result.sent++; }
        result.refill_due++;
      }
    }

    logAudit(req, "notify_run_alerts", "notifications", null, result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
