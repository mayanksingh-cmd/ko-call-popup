#!/usr/bin/env node
/**
 * create-ko-call.js
 *
 * CLI script for the team to register a new KO call and get the wrapper link.
 * Run from the server/ directory:
 *
 *   node scripts/create-ko-call.js \
 *     --userName="Jane Smith" \
 *     --userEmail="jane@example.com" \
 *     --userPhone="+14155551234" \
 *     --meetingNumber="12345678901" \
 *     --passcode="abc123" \
 *     --advisorName="Ananya Sharma" \
 *     --advisorRole="Customer Success"
 *
 * Prints the wrapper URL the team should send instead of the raw Zoom link.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { createCall } = require("../db");
const crypto = require("crypto");

// Parse --key=value args
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [key, ...rest] = a.slice(2).split("=");
      return [key, rest.join("=")];
    })
);

const required = ["userName", "userEmail", "meetingNumber", "advisorName", "advisorRole"];
const missing = required.filter((k) => !args[k]);
if (missing.length) {
  console.error(`\nMissing required args: ${missing.map((k) => `--${k}`).join(", ")}\n`);
  console.error("Usage: node scripts/create-ko-call.js --userName=\"Jane Smith\" --userEmail=jane@example.com --meetingNumber=12345678901 --advisorName=\"Ananya Sharma\" --advisorRole=\"Customer Success\"\n");
  process.exit(1);
}

// Generate a short unique token: ko_<8 random hex chars>
const token = `ko_${crypto.randomBytes(4).toString("hex")}`;

try {
  createCall({
    token,
    userId:        args.userId || `u_${Date.now()}`,
    userName:      args.userName,
    userEmail:     args.userEmail || "",
    userPhone:     args.userPhone || "",
    meetingNumber: args.meetingNumber,
    passcode:      args.passcode || "",
    advisorName:   args.advisorName,
    advisorRole:   args.advisorRole,
    advisorPhoto:  args.advisorPhoto || "",
    callDuration:  args.callDuration || "12–15 min",
    scheduledAt:   args.scheduledAt || new Date().toISOString(),
  });

  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const wrapperUrl = `${baseUrl}/ko-call/${token}`;

  console.log(`
✅  KO call created
    Token:       ${token}
    User:        ${args.userName} <${args.userEmail || "no email"}>
    Advisor:     ${args.advisorName} (${args.advisorRole})
    Meeting:     ${args.meetingNumber}

📎  Wrapper link to send:
    ${wrapperUrl}

    Send this link instead of the raw Zoom invite.
`);
} catch (err) {
  if (err.message?.includes("UNIQUE constraint")) {
    console.error(`\nA call with token "${token}" already exists (collision — just run again).\n`);
  } else {
    console.error("\nFailed to create KO call:", err.message, "\n");
  }
  process.exit(1);
}
