type Advisor = {
  advisorName: string;
  advisorRole: string;
  advisorPhoto: string;
  callDuration?: string;
};

type Props = {
  advisor: Advisor;
  onStay: () => void;
  onReschedule: () => void;
  onLeaveAnyway: () => void;
};

const BENEFITS = [
  "Get your current setup reviewed live with an expert",
  "Launch your first workflow or campaign faster",
  "Leave with a clear action plan tailored to your business",
];

export default function ExitPopup({ advisor, onStay, onReschedule, onLeaveAnyway }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onStay}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 999,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Modal card */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          borderRadius: 20,
          padding: "32px 28px",
          width: 420,
          maxWidth: "92vw",
          zIndex: 1000,
          boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
        }}
      >
        {/* Advisor block */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 22,
            padding: "14px 16px",
            background: "#f9fafb",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
          }}
        >
          <img
            src={advisor.advisorPhoto}
            alt={advisor.advisorName}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
              border: "2px solid #e5e7eb",
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
              {advisor.advisorName}
            </div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
              {advisor.advisorRole}
            </div>
            {advisor.callDuration && (
              <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>
                Typical call: {advisor.callDuration}
              </div>
            )}
          </div>
          {/* Live indicator */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
                animation: "pulse 1.5s infinite",
              }}
            />
            <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>Live</span>
          </div>
        </div>

        {/* Headline */}
        <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6, color: "#111827" }}>
          Leave this kickoff call?
        </h2>
        <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
          Here's what you'll get by staying just a few more minutes:
        </p>

        {/* Benefits list */}
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 26px 0" }}>
          {BENEFITS.map((benefit, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: 12,
                fontSize: 14,
                color: "#374151",
                lineHeight: 1.5,
              }}
            >
              <span
                style={{
                  color: "#fff",
                  background: "#22c55e",
                  borderRadius: "50%",
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                ✓
              </span>
              {benefit}
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <button
          onClick={onStay}
          style={{
            width: "100%",
            padding: "13px 0",
            background: "#111827",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            marginBottom: 10,
            transition: "background 0.2s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#374151")}
          onMouseOut={(e) => (e.currentTarget.style.background = "#111827")}
        >
          Stay on call
        </button>

        <button
          onClick={onReschedule}
          style={{
            width: "100%",
            padding: "13px 0",
            background: "#f3f4f6",
            color: "#111827",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            marginBottom: 18,
            transition: "background 0.2s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#e5e7eb")}
          onMouseOut={(e) => (e.currentTarget.style.background = "#f3f4f6")}
        >
          Reschedule instantly
        </button>

        <div style={{ textAlign: "center" }}>
          <button
            onClick={onLeaveAnyway}
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Leave anyway
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
