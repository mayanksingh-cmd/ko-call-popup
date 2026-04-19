import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ZoomMtgEmbedded from "@zoom/meetingsdk/embedded";
import ExitPopup from "../components/ExitPopup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type KOCallConfig = {
  koCallToken: string;
  meetingNumber: string;
  passcode: string;
  advisorName: string;
  advisorRole: string;
  advisorPhoto: string;
  callDuration: string;
  scheduledAt: string;
  userName: string;
};

type MeetingState = "loading" | "prejoin" | "joining" | "live" | "error";

// ---------------------------------------------------------------------------
// Analytics helper — swap with Mixpanel / Segment in production
// ---------------------------------------------------------------------------
function track(event: string, props?: Record<string, unknown>) {
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties: props }),
  }).catch(() => {});
  console.log(`[Analytics] ${event}`, props ?? "");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function KickoffCallPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const meetingContainerRef = useRef<HTMLDivElement>(null);
  const zoomClientRef = useRef<any>(null);

  const [callConfig, setCallConfig] = useState<KOCallConfig | null>(null);
  const [meetingState, setMeetingState] = useState<MeetingState>("loading");
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [joinTime, setJoinTime] = useState<number | null>(null);
  const [userName, setUserName] = useState("");

  // -------------------------------------------------------------------------
  // 1. Fetch KO call config from backend
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!token) return;

    fetch(`/api/ko-call/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("KO call not found");
        return r.json();
      })
      .then((data: KOCallConfig) => {
        setCallConfig(data);
        setUserName(data.userName || "");
        setMeetingState("prejoin");
        track("ko_call_page_loaded", { token });
      })
      .catch((err) => {
        setMeetingState("error");
        setErrorMessage(err.message || "Failed to load call details");
      });
  }, [token]);

  // -------------------------------------------------------------------------
  // 2. Initialize Zoom SDK only after user clicks Join
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // 3. Block accidental browser close / tab refresh while in meeting
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (meetingState === "live") {
        e.preventDefault();
        e.returnValue = true;
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [meetingState]);

  // Prevents double-navigation when we call leaveMeeting() ourselves
  const isManualLeave = useRef(false);

  // -------------------------------------------------------------------------
  // Core: initialize and join Zoom meeting
  // -------------------------------------------------------------------------
  async function initMeeting(config: KOCallConfig) {
    try {
      setMeetingState("joining");

      // Create the embedded Zoom client
      const client = ZoomMtgEmbedded.createClient();
      zoomClientRef.current = client;

      // Init against your container div
      await client.init({
        zoomAppRoot: meetingContainerRef.current!,
        language: "en-US",
        patchJsMedia: true,
        customize: {
          video: {
            isResizable: true,
            viewSizes: {
              default: { width: 1200, height: 600 },
            },
          },
        },
      });

      // Hide Zoom's internal leave/end button so only our custom button triggers the popup.
      // Use a MutationObserver because Zoom renders the toolbar asynchronously.
      if (!document.getElementById("zoom-hide-leave")) {
        const style = document.createElement("style");
        style.id = "zoom-hide-leave";
        style.textContent = `
          button[class*="leave" i], button[class*="Leave"],
          button[class*="leaveBtn"], button[class*="leave-btn"],
          button[aria-label*="Leave" i], button[title*="Leave" i],
          [class*="LeaveBtn"], [class*="leave-meeting"],
          [class*="end-meeting"], [class*="endBtn"] {
            display: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Get server-signed JWT — never generate this in the browser
      const sigRes = await fetch("/api/zoom-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingNumber: config.meetingNumber,
          role: 0, // 0 = attendee
        }),
      });

      if (!sigRes.ok) {
        const err = await sigRes.json();
        throw new Error(err.error || "Failed to get Zoom signature");
      }

      const { signature, sdkKey } = await sigRes.json();

      // Join the meeting
      await client.join({
        sdkKey,
        signature,
        meetingNumber: config.meetingNumber,
        password: config.passcode,
        userName: userName || config.userName,
      });

      setMeetingState("live");
      setJoinTime(Date.now());
      track("ko_meeting_join_success", { token, meetingNumber: config.meetingNumber });

      // Detect meeting close / disconnect.
      // Skip navigation if we're already handling it (manual leave/reschedule).
      client.on("connection-change", (payload: any) => {
        if (payload?.state === "Closed" && !isManualLeave.current) {
          const secondsInCall = joinTime ? Math.floor((Date.now() - joinTime) / 1000) : 0;
          track("ko_meeting_closed", { secondsInCall });
          navigate(`/post-call/${token}`);
        }
      });

    } catch (err: any) {
      console.error("Zoom init error (full):", JSON.stringify(err), err);
      setMeetingState("error");
      const zoomMsg = err?.reason || err?.errorCode || err?.message || JSON.stringify(err) || "Unknown error";
      setErrorMessage(`Zoom error: ${zoomMsg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Exit popup handlers
  // -------------------------------------------------------------------------
  const handleLeaveClick = () => {
    track("ko_exit_popup_shown", { secondsInCall: joinTime ? Math.floor((Date.now() - joinTime) / 1000) : 0 });
    setShowExitPopup(true);
  };

  const handleStay = () => {
    track("ko_stay_on_call_clicked");
    setShowExitPopup(false);
  };

  const handleReschedule = async () => {
    track("ko_reschedule_clicked");
    isManualLeave.current = true;
    if (zoomClientRef.current) {
      await zoomClientRef.current.leaveMeeting();
    }
    navigate(`/reschedule/${token}`);
  };

  const handleLeaveAnyway = async () => {
    track("ko_leave_anyway_clicked");
    isManualLeave.current = true;
    if (zoomClientRef.current) {
      await zoomClientRef.current.leaveMeeting();
    }
    navigate(`/post-call/${token}`);
  };

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------
  if (meetingState === "error") {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.errorCard}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ marginBottom: 8, fontSize: 18 }}>Unable to join meeting</h2>
          <p style={{ color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>{errorMessage}</p>
          <div style={styles.setupBox}>
            <strong>Quick setup:</strong>
            <ol style={{ paddingLeft: 20, marginTop: 8, lineHeight: 2 }}>
              <li>Copy <code>server/.env.example</code> → <code>server/.env</code></li>
              <li>Add your Zoom SDK credentials</li>
              <li>Restart the server: <code>cd server && npm start</code></li>
            </ol>
          </div>
          <button onClick={() => window.location.reload()} style={styles.primaryButton}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", position: "relative", background: "#000", overflow: "hidden" }}>

      {/* ── Header bar — floating overlay, hidden during pre-join ── */}
      <div style={{ ...styles.header, display: (meetingState === "loading" || meetingState === "prejoin") ? "none" : "flex" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {callConfig?.advisorPhoto && (
            <img
              src={callConfig.advisorPhoto}
              alt={callConfig.advisorName}
              style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
            />
          )}
          <div>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>
              Kickoff Call
              {callConfig?.advisorName && ` with ${callConfig.advisorName}`}
            </span>
            <span style={{ marginLeft: 10, fontSize: 12, color: "#9ca3af" }}>
              {callConfig?.callDuration && `~${callConfig.callDuration}`}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Live / joining indicator */}
          {meetingState === "joining" && (
            <span style={{ fontSize: 12, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }} />
              Joining…
            </span>
          )}
          {meetingState === "live" && (
            <span style={{ fontSize: 12, color: "#22c55e", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 1.5s infinite" }} />
              Live
            </span>
          )}

          {/* Only show Leave button once in the meeting */}
          {meetingState === "live" && (
            <button onClick={handleLeaveClick} style={styles.leaveButton}>
              Leave call
            </button>
          )}
        </div>
      </div>

      {/* ── Zoom meeting container — full viewport height ── */}
      <div style={{ position: "absolute", inset: 0 }}>

        {/* Pre-join screen — overlays the (hidden) meeting container */}
        {(meetingState === "loading" || meetingState === "prejoin") && (
          <div style={{ position: "absolute", inset: 0, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            {meetingState === "loading" ? (
              <div style={styles.spinner} />
            ) : (
              <div style={{ display: "flex", gap: 48, alignItems: "center", padding: "0 40px", maxWidth: 900, width: "100%" }}>

                {/* Left: video preview */}
                <div style={{ flex: "0 0 480px", borderRadius: 12, overflow: "hidden", background: "#1a1a1a", aspectRatio: "4/3", display: "flex", flexDirection: "column" }}>
                  {/* Camera area */}
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
                      <rect x="24" y="20" width="48" height="44" rx="22" fill="#4a4a4a"/>
                      <ellipse cx="48" cy="76" rx="36" ry="18" fill="#4a4a4a"/>
                    </svg>
                  </div>
                  {/* Controls bar */}
                  <div style={{ background: "#222", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6 }}>
                    <button style={styles.zoomCtrlBtn}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-1 16.93V22h2v-2.07A8 8 0 0 0 20 12h-2a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93z"/></svg>
                      <span style={{ fontSize: 12 }}>Mute</span>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="#aaa"><path d="M5 7L1 3h8z"/></svg>
                    </button>
                    <button style={styles.zoomCtrlBtn}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M15 8v8H5V8h10m1-2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4V7a1 1 0 0 0-1-1z"/></svg>
                      <span style={{ fontSize: 12 }}>Start Video</span>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="#aaa"><path d="M5 7L1 3h8z"/></svg>
                    </button>
                    <button style={{ ...styles.zoomCtrlBtn, marginLeft: "auto" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                      <span style={{ fontSize: 12 }}>Backgrounds</span>
                    </button>
                  </div>
                </div>

                {/* Right: form */}
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 20 }}>Enter Meeting Info</h2>

                  <label style={{ display: "block", marginBottom: 4, fontSize: 14, color: "#111", fontWeight: 500 }}>
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && callConfig && userName.trim()) initMeeting(callConfig); }}
                    placeholder=""
                    style={styles.zoomNameInput}
                    autoFocus
                  />

                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#333", marginBottom: 20, cursor: "pointer" }}>
                    <input type="checkbox" style={{ width: 14, height: 14 }} />
                    Remember my name for future meetings
                  </label>

                  <button
                    onClick={() => { if (callConfig && userName.trim()) initMeeting(callConfig); }}
                    disabled={!userName.trim()}
                    style={{ ...styles.zoomJoinBtn, background: userName.trim() ? "#0b5cff" : "#e8e8e8", color: userName.trim() ? "#fff" : "#333" }}
                  >
                    Join
                  </button>

                  <p style={{ marginTop: 14, fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                    By clicking "Join", you agree to our{" "}
                    <span style={{ color: "#0070c9", cursor: "pointer" }}>Terms of Service</span> and{" "}
                    <span style={{ color: "#0070c9", cursor: "pointer" }}>Privacy Statement</span>.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {meetingState === "joining" && (
          <div style={styles.loadingOverlay}>
            <div style={styles.spinner} />
            <p style={{ color: "#d1d5db", marginTop: 16, fontSize: 14 }}>Joining your kickoff call…</p>
          </div>
        )}

        <div
          ref={meetingContainerRef}
          id="meetingSDKElement"
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* ── Exit popup ── */}
      {showExitPopup && callConfig && (
        <ExitPopup
          advisor={callConfig}
          onStay={handleStay}
          onReschedule={handleReschedule}
          onLeaveAnyway={handleLeaveAnyway}
        />
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spin   { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 20px",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)",
    height: 56,
  },
  leaveButton: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "7px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  centerScreen: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f9fafb",
    padding: 20,
  },
  errorCard: {
    background: "#fff",
    borderRadius: 16,
    padding: 36,
    maxWidth: 480,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  },
  setupBox: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "16px 20px",
    textAlign: "left",
    fontSize: 14,
    marginBottom: 20,
  },
  primaryButton: {
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "11px 28px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#111827",
    zIndex: 10,
  },
  spinner: {
    width: 36,
    height: 36,
    border: "3px solid #374151",
    borderTop: "3px solid #60a5fa",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  zoomCtrlBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    padding: "5px 10px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
  },
  zoomNameInput: {
    display: "block",
    width: "100%",
    marginBottom: 12,
    padding: "9px 12px",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box" as const,
    background: "#fff",
    color: "#111",
  },
  zoomJoinBtn: {
    width: "100%",
    background: "#e8e8e8",
    color: "#333",
    border: "none",
    borderRadius: 6,
    padding: "11px 0",
    fontWeight: 500,
    fontSize: 15,
    cursor: "pointer",
  },
  prejoinCard: {
    background: "#1f2937",
    borderRadius: 16,
    padding: "36px 32px",
    maxWidth: 400,
    width: "100%",
    textAlign: "center" as const,
    boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
  },
  nameInput: {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #374151",
    background: "#111827",
    color: "#fff",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  joinButton: {
    marginTop: 20,
    width: "100%",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 0",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  },
};
