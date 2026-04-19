import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function PostCallPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const notified = useRef(false);

  // Fire recovery notification once when the page mounts
  useEffect(() => {
    if (!token || notified.current) return;
    notified.current = true;

    fetch("/api/notify-dropout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => console.log("[Notify] dropout notification:", data.results))
      .catch((err) => console.error("[Notify] failed:", err));
  }, [token]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f9fafb",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "40px 36px",
          width: 460,
          maxWidth: "100%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          You left the call early
        </h2>
        <p style={{ color: "#6b7280", lineHeight: 1.6, marginBottom: 28, fontSize: 14 }}>
          No worries — you can still complete your kickoff call to get the most out of your trial.
          Our team is ready to help you get set up. We've also sent you a recovery link by email.
        </p>

        {/* Recovery options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          <button
            onClick={() => navigate(`/reschedule/${token}`)}
            style={{
              background: "#111827",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "13px 0",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Reschedule my kickoff call
          </button>

          <button
            onClick={() => navigate(`/ko-call/${token}`)}
            style={{
              background: "#f3f4f6",
              color: "#111827",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "13px 0",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Rejoin the current call
          </button>
        </div>

        {/* What you missed */}
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "16px 20px",
            textAlign: "left",
            marginBottom: 20,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#374151" }}>
            What you'll cover in the kickoff call:
          </p>
          {[
            "Live review of your account setup",
            "Launch your first workflow or campaign",
            "Clear next steps tailored to your business",
          ].map((item, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 13, color: "#6b7280" }}
            >
              <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span>
              {item}
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: "#9ca3af" }}>
          Questions? Reply to your onboarding email or contact support.
        </p>
      </div>
    </div>
  );
}
