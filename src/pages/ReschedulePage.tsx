import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

type Slot = {
  id: string;
  label: string;
  time: string;
  iso: string;
};

function track(event: string, props?: Record<string, unknown>) {
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties: props }),
  }).catch(() => {});
}

export default function ReschedulePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    track("ko_reschedule_page_loaded", { token });
    fetch("/api/reschedule-slots")
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.slots || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const handleConfirm = async () => {
    if (!selectedSlot) return;
    setConfirming(true);

    await fetch("/api/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: selectedSlot, koCallToken: token }),
    });

    track("ko_reschedule_completed", { slotId: selectedSlot, token });
    setConfirmed(true);
    setConfirming(false);
  };

  // ── Confirmed state ──
  if (confirmed) {
    const slot = slots.find((s) => s.id === selectedSlot);
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            You're all set!
          </h2>
          <p style={{ color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
            Your kickoff call has been rescheduled for{" "}
            <strong>
              {slot?.label} at {slot?.time}
            </strong>
            .<br />
            You'll receive a confirmation email shortly.
          </p>
          <button onClick={() => navigate("/")} style={styles.primaryButton}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            Pick a better time
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.5 }}>
            Choose from the next available slots with your advisor. Takes 10 seconds.
          </p>
        </div>

        {/* Slots */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af" }}>
            Loading available times…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {slots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => setSelectedSlot(slot.id)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  border: selectedSlot === slot.id ? "2px solid #111827" : "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: selectedSlot === slot.id ? "#f9fafb" : "#fff",
                  cursor: "pointer",
                  fontWeight: selectedSlot === slot.id ? 600 : 400,
                  fontSize: 14,
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ color: "#111827" }}>
                  {slot.label}
                </span>
                <span style={{ color: "#6b7280" }}>
                  {slot.time}
                </span>
                {selectedSlot === slot.id && (
                  <span style={{ marginLeft: 8, color: "#22c55e", fontWeight: 700 }}>✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!selectedSlot || confirming}
          style={{
            ...styles.primaryButton,
            width: "100%",
            opacity: !selectedSlot || confirming ? 0.5 : 1,
            cursor: !selectedSlot || confirming ? "not-allowed" : "pointer",
          }}
        >
          {confirming ? "Confirming…" : "Confirm new time"}
        </button>

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f9fafb",
    padding: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    padding: "36px 32px",
    width: 440,
    maxWidth: "100%",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
  },
  primaryButton: {
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "13px 0",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  },
};
