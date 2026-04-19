const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config();

const nodemailer = require("nodemailer");
const { getCallByToken, createCall, insertEvent, getAnalyticsSummary } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// Serve the React production build from ../build
const BUILD_DIR = path.join(__dirname, "../build");
app.use(express.static(BUILD_DIR));

// ---------------------------------------------------------------------------
// POST /api/zoom-signature
// Called by the frontend before joining a meeting.
// Returns a server-signed JWT that Zoom SDK requires for auth.
// ---------------------------------------------------------------------------
app.post("/api/zoom-signature", (req, res) => {
  const { meetingNumber, role = 0 } = req.body;

  if (!meetingNumber) {
    return res.status(400).json({ error: "meetingNumber is required" });
  }

  if (!process.env.ZOOM_MEETING_SDK_KEY || !process.env.ZOOM_MEETING_SDK_SECRET) {
    return res.status(500).json({
      error: "Zoom SDK credentials not configured. Copy server/.env.example to server/.env and fill in your credentials.",
    });
  }

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2; // valid for 2 hours

  const payload = {
    sdkKey: process.env.ZOOM_MEETING_SDK_KEY,
    appKey: process.env.ZOOM_MEETING_SDK_KEY,
    mn: meetingNumber,
    role,
    iat,
    exp,
    tokenExp: exp,
  };

  const signature = jwt.sign(payload, process.env.ZOOM_MEETING_SDK_SECRET, {
    algorithm: "HS256",
  });

  return res.json({
    signature,
    sdkKey: process.env.ZOOM_MEETING_SDK_KEY,
  });
});

// ---------------------------------------------------------------------------
// GET /api/ko-call/:token
// Returns KO call details (advisor info, meeting number, etc.) for a token.
// ---------------------------------------------------------------------------
app.get("/api/ko-call/:token", (req, res) => {
  const row = getCallByToken(req.params.token);
  if (!row) {
    return res.status(404).json({ error: "KO call not found" });
  }
  // Map DB snake_case columns → camelCase for the frontend; omit internal IDs
  return res.json({
    koCallToken:   row.token,
    meetingNumber: row.meeting_number,
    passcode:      row.passcode,
    advisorName:   row.advisor_name,
    advisorRole:   row.advisor_role,
    advisorPhoto:  row.advisor_photo,
    callDuration:  row.call_duration,
    scheduledAt:   row.scheduled_at,
    userName:      row.user_name,
  });
});

// ---------------------------------------------------------------------------
// POST /api/ko-call
// Creates a new KO call record in the database.
// Body: { token, userId, userName, meetingNumber, passcode?,
//         advisorName, advisorRole, advisorPhoto?, callDuration?, scheduledAt? }
// ---------------------------------------------------------------------------
app.post("/api/ko-call", (req, res) => {
  const { token, userId, userName, meetingNumber, advisorName, advisorRole } = req.body;
  if (!token || !userId || !userName || !meetingNumber || !advisorName || !advisorRole) {
    return res.status(400).json({ error: "Missing required fields: token, userId, userName, meetingNumber, advisorName, advisorRole" });
  }
  try {
    createCall(req.body);
    return res.status(201).json({ ok: true, token });
  } catch (err) {
    if (err.message?.includes("UNIQUE constraint")) {
      return res.status(409).json({ error: "A call with that token already exists" });
    }
    console.error("[createCall error]", err);
    return res.status(500).json({ error: "Failed to create KO call" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/analytics
// Receives frontend analytics events, persists them to SQLite.
// ---------------------------------------------------------------------------
app.post("/api/analytics", (req, res) => {
  const { event, properties } = req.body;
  if (event) {
    insertEvent(event, properties || {});
    console.log(`[Analytics] ${event}`, properties || "");
  }
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /analytics
// Internal dashboard — shows the KO call funnel and recent events.
// ---------------------------------------------------------------------------
app.get("/analytics", (req, res) => {
  const { counts, recent } = getAnalyticsSummary();

  // Build funnel from event counts
  const get = (name) => counts.find((c) => c.event === name)?.count ?? 0;
  const loaded    = get("ko_call_page_loaded");
  const joined    = get("ko_meeting_join_success");
  const popup     = get("ko_exit_popup_shown");
  const stayed    = get("ko_stay_on_call_clicked");
  const reschedule = get("ko_reschedule_clicked");
  const left      = get("ko_leave_anyway_clicked");

  const pct = (a, b) => b ? `${Math.round((a / b) * 100)}%` : "—";

  const funnelRows = [
    { label: "Page loaded",       count: loaded,     rate: "100%" },
    { label: "Joined Zoom",       count: joined,     rate: pct(joined, loaded) },
    { label: "Exit popup shown",  count: popup,      rate: pct(popup, joined) },
    { label: "→ Stayed on call",  count: stayed,     rate: pct(stayed, popup) },
    { label: "→ Rescheduled",     count: reschedule, rate: pct(reschedule, popup) },
    { label: "→ Left anyway",     count: left,       rate: pct(left, popup) },
  ];

  const funnelHtml = funnelRows.map((r) => `
    <tr>
      <td style="padding:10px 16px;color:#374151">${r.label}</td>
      <td style="padding:10px 16px;text-align:right;font-weight:600">${r.count}</td>
      <td style="padding:10px 16px;text-align:right;color:#6b7280">${r.rate}</td>
    </tr>`).join("");

  const recentHtml = recent.map((r) => `
    <tr>
      <td style="padding:8px 12px;color:#6b7280;font-size:12px">${r.created_at}</td>
      <td style="padding:8px 12px;font-weight:500">${r.event}</td>
      <td style="padding:8px 12px;color:#6b7280;font-size:12px">${r.token || "—"}</td>
      <td style="padding:8px 12px;color:#6b7280;font-size:12px">${JSON.stringify(r.properties)}</td>
    </tr>`).join("");

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>KO Call Analytics</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f9fafb; color: #111827; padding: 32px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 32px; }
    .card { background: #fff; border-radius: 14px; border: 1px solid #e5e7eb; margin-bottom: 28px; overflow: hidden; }
    .card-header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; }
    tr:not(:last-child) td { border-bottom: 1px solid #f3f4f6; }
    .refresh { float: right; font-size: 12px; color: #6b7280; font-weight: 400; }
  </style>
</head>
<body>
  <h1>KO Call Analytics</h1>
  <p class="subtitle">Internal dashboard — refreshes on page load &nbsp;·&nbsp; <a href="/analytics">Refresh now</a></p>

  <div class="card">
    <div class="card-header">Conversion funnel</div>
    <table>
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:500">Step</th>
          <th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:500">Count</th>
          <th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:500">Rate vs prev</th>
        </tr>
      </thead>
      <tbody>${funnelHtml}</tbody>
    </table>
  </div>

  <div class="card">
    <div class="card-header">Recent events <span class="refresh">(last 100)</span></div>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500">Time (UTC)</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500">Event</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500">Token</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500">Properties</th>
          </tr>
        </thead>
        <tbody>${recentHtml || '<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af">No events yet</td></tr>'}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// POST /api/notify-dropout
// Fires when a user lands on the post-call page.
// Sends a recovery email (and optional SMS) with rejoin / reschedule links.
// ---------------------------------------------------------------------------
app.post("/api/notify-dropout", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token is required" });

  const row = getCallByToken(token);
  if (!row) return res.status(404).json({ error: "KO call not found" });

  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const rejoinUrl      = `${baseUrl}/ko-call/${token}`;
  const rescheduleUrl  = `${baseUrl}/reschedule/${token}`;

  const results = { email: null, sms: null };

  // ── Email ────────────────────────────────────────────────────────────────
  if (row.user_email && process.env.SMTP_HOST) {
    try {
      const transporter = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from:    process.env.FROM_EMAIL || process.env.SMTP_USER,
        to:      row.user_email,
        subject: `${row.advisor_name} is still here — finish your kickoff call`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111827">
            <p style="font-size:16px;margin-bottom:16px">Hi ${row.user_name},</p>
            <p style="font-size:15px;color:#374151;line-height:1.6;margin-bottom:24px">
              It looks like you left your kickoff call early. No worries —
              <strong>${row.advisor_name}</strong> is ready to pick up right where you left off.
              Users who complete their kickoff call get set up <strong>2× faster</strong>.
            </p>

            <a href="${rejoinUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:10px;padding:12px 28px;font-weight:700;font-size:15px;margin-bottom:12px">
              Rejoin the call now
            </a>
            <br>
            <a href="${rescheduleUrl}" style="display:inline-block;color:#6b7280;font-size:13px;margin-top:8px">
              Or pick a new time →
            </a>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
            <p style="font-size:12px;color:#9ca3af">
              You're receiving this because you joined a kickoff call.
              Reply to this email if you need help.
            </p>
          </div>
        `,
      });
      results.email = "sent";
      console.log(`[Notify] Email sent to ${row.user_email}`);
    } catch (err) {
      results.email = `error: ${err.message}`;
      console.error("[Notify] Email failed:", err.message);
    }
  } else {
    results.email = row.user_email ? "skipped: SMTP not configured" : "skipped: no email on record";
  }

  // ── SMS via Twilio (optional) ─────────────────────────────────────────────
  if (row.user_phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const body = `Hi ${row.user_name}, you left your kickoff call early. Rejoin here: ${rejoinUrl}`;

      const twilioRes = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
          ).toString("base64"),
        },
        body: new URLSearchParams({
          From: process.env.TWILIO_FROM_NUMBER,
          To:   row.user_phone,
          Body: body,
        }),
      });

      const twilioData = await twilioRes.json();
      if (!twilioRes.ok) throw new Error(twilioData.message || "Twilio error");
      results.sms = "sent";
      console.log(`[Notify] SMS sent to ${row.user_phone}`);
    } catch (err) {
      results.sms = `error: ${err.message}`;
      console.error("[Notify] SMS failed:", err.message);
    }
  } else {
    results.sms = row.user_phone ? "skipped: Twilio not configured" : "skipped: no phone on record";
  }

  return res.json({ ok: true, results });
});

// ---------------------------------------------------------------------------
// GET /api/reschedule-slots
// Returns next available reschedule slots.
// In production, pull from Calendly / Cal.com API.
// ---------------------------------------------------------------------------
app.get("/api/reschedule-slots", (req, res) => {
  const now = new Date();
  const slots = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now);
    d.setHours(10, 0, 0, 0);
    d.setDate(d.getDate() + i + 1);
    return {
      id: `slot_${i}`,
      label: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      iso: d.toISOString(),
    };
  });
  return res.json({ slots });
});

// ---------------------------------------------------------------------------
// POST /api/reschedule
// Confirms a reschedule slot.
// In production, update your scheduling system and send confirmation.
// ---------------------------------------------------------------------------
app.post("/api/reschedule", (req, res) => {
  const { slotId, koCallToken } = req.body;
  console.log(`[Reschedule] Token=${koCallToken} → Slot=${slotId}`);
  return res.json({ ok: true, message: "Reschedule confirmed" });
});

// All non-API routes → React app (handles client-side routing)
app.get("*", (req, res) => {
  res.sendFile(path.join(BUILD_DIR, "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n✅  KO Call server running at http://localhost:${PORT}`);
  console.log(`   Signature endpoint: POST http://localhost:${PORT}/api/zoom-signature`);
  console.log(`   KO call lookup:     GET  http://localhost:${PORT}/api/ko-call/:token`);
  console.log(`\n⚠️  Don't forget to copy server/.env.example → server/.env and add your Zoom credentials.\n`);
});
