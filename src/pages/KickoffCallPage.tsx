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

type MeetingState = "loading" | "joining" | "live" | "error";

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
        track("ko_call_page_loaded", { token });
      })
      .catch((err) => {
        setMeetingState("error");
        setErrorMessage(err.message || "Failed to load call details");
      });
  }, [token]);

  // -------------------------------------------------------------------------
  // 2. Initialize Zoom SDK once config is ready
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!callConfig || !meetingContainerRef.current) return;

    initMeeting(callConfig);
  }, [callConfig]); // only re-run when callConfig changes

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
        userName: config.userName,
      });

      setMeetingState("live");
      setJoinTime(Date.now());
      track("ko_meeting_join_success", { token, meetingNumber: config.meetingNumber });

      // Detect meeting close / disconnect
      client.on("connection-change", (payload: any) => {
        if (payload?.state === "Closed") {
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
    if (zoomClientRef.current) {
      await zoomClientRef.current.leaveMeeting();
    }
    navigate(`/reschedule/${token}`);
  };

  const handleLeaveAnyway = async () => {
    track("ko_leave_anyway_clicked");
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
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111827" }}>

      {/* ── Header bar ── */}
      <div style={styles.header}>
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

      {/* ── Zoom meeting container ── */}
      <div style={{ flex: 1, position: "relative" }}>
        {meetingState === "joining" && (
          <div style={styles.loadingOverlay}>
            <div style={styles.spinner} />
            <p style={{ color: "#d1d5db", marginTop: 16, fontSize: 14 }}>
              Joining your kickoff call…
            </p>
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
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 20px",
    background: "#1f2937",
    borderBottom: "1px solid #374151",
    flexShrink: 0,
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
};
