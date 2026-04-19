const Database = require("better-sqlite3");
const path = require("path");

// ---------------------------------------------------------------------------
// Open (or create) the SQLite database file next to this script
// ---------------------------------------------------------------------------
const db = new Database(path.join(__dirname, "ko_calls.db"));

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event      TEXT NOT NULL,
    token      TEXT,
    properties TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ko_calls (
    token          TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    user_name      TEXT NOT NULL,
    user_email     TEXT NOT NULL DEFAULT '',
    user_phone     TEXT NOT NULL DEFAULT '',
    meeting_number TEXT NOT NULL,
    passcode       TEXT NOT NULL DEFAULT '',
    advisor_name   TEXT NOT NULL,
    advisor_role   TEXT NOT NULL,
    advisor_photo  TEXT NOT NULL DEFAULT '',
    call_duration  TEXT NOT NULL DEFAULT '12–15 min',
    scheduled_at   TEXT NOT NULL
  );
`);

// Migrate existing DBs that pre-date user_email / user_phone columns
for (const col of ["user_email TEXT NOT NULL DEFAULT ''", "user_phone TEXT NOT NULL DEFAULT ''"]) {
  try { db.exec(`ALTER TABLE ko_calls ADD COLUMN ${col}`); } catch (_) { /* already exists */ }
}

// ---------------------------------------------------------------------------
// Seed the demo row if it doesn't exist yet
// ---------------------------------------------------------------------------
const seed = db.prepare(`
  INSERT OR IGNORE INTO ko_calls
    (token, user_id, user_name, user_email, user_phone, meeting_number, passcode,
     advisor_name, advisor_role, advisor_photo, call_duration, scheduled_at)
  VALUES
    (@token, @user_id, @user_name, @user_email, @user_phone, @meeting_number, @passcode,
     @advisor_name, @advisor_role, @advisor_photo, @call_duration, @scheduled_at)
`);

seed.run({
  token:          "demo-token-abc123",
  user_id:        "u_001",
  user_name:      "Mayank Singh",
  user_email:     process.env.DEMO_USER_EMAIL || "",
  user_phone:     process.env.DEMO_USER_PHONE || "",
  meeting_number: process.env.DEMO_MEETING_NUMBER || "12345678901",
  passcode:       process.env.DEMO_MEETING_PASSCODE || "",
  advisor_name:   "Ananya Sharma",
  advisor_role:   "Customer Success",
  advisor_photo:  "https://i.pravatar.cc/100?img=47",
  call_duration:  "12–15 min",
  scheduled_at:   new Date().toISOString(),
});

// Always sync meeting credentials from .env so restarts pick up new values
if (process.env.DEMO_MEETING_NUMBER) {
  db.prepare("UPDATE ko_calls SET meeting_number = ?, passcode = ? WHERE token = 'demo-token-abc123'")
    .run(process.env.DEMO_MEETING_NUMBER, process.env.DEMO_MEETING_PASSCODE || "");
}

// ---------------------------------------------------------------------------
// Queries used by index.js
// ---------------------------------------------------------------------------

/** Returns the full row for a token, or undefined if not found. */
function getCallByToken(token) {
  return db.prepare("SELECT * FROM ko_calls WHERE token = ?").get(token);
}

/**
 * Creates a new KO call record.
 * Throws if token already exists.
 */
function createCall({
  token,
  userId,
  userName,
  userEmail = "",
  userPhone = "",
  meetingNumber,
  passcode = "",
  advisorName,
  advisorRole,
  advisorPhoto = "",
  callDuration = "12–15 min",
  scheduledAt,
}) {
  db.prepare(`
    INSERT INTO ko_calls
      (token, user_id, user_name, user_email, user_phone, meeting_number, passcode,
       advisor_name, advisor_role, advisor_photo, call_duration, scheduled_at)
    VALUES
      (@token, @userId, @userName, @userEmail, @userPhone, @meetingNumber, @passcode,
       @advisorName, @advisorRole, @advisorPhoto, @callDuration, @scheduledAt)
  `).run({
    token,
    userId,
    userName,
    userEmail,
    userPhone,
    meetingNumber,
    passcode,
    advisorName,
    advisorRole,
    advisorPhoto,
    callDuration,
    scheduledAt: scheduledAt ?? new Date().toISOString(),
  });
}

/** Inserts one analytics event row. */
function insertEvent(event, properties = {}) {
  const token = properties.token || null;
  db.prepare(`
    INSERT INTO analytics_events (event, token, properties)
    VALUES (?, ?, ?)
  `).run(event, token, JSON.stringify(properties));
}

/** Returns per-event counts and recent rows for the dashboard. */
function getAnalyticsSummary() {
  const counts = db.prepare(`
    SELECT event, COUNT(*) as count
    FROM analytics_events
    GROUP BY event
    ORDER BY count DESC
  `).all();

  const recent = db.prepare(`
    SELECT id, event, token, properties, created_at
    FROM analytics_events
    ORDER BY id DESC
    LIMIT 100
  `).all().map((r) => ({ ...r, properties: JSON.parse(r.properties) }));

  return { counts, recent };
}

module.exports = { getCallByToken, createCall, insertEvent, getAnalyticsSummary };
