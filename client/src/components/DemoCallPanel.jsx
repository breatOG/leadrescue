import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, PhoneOff, Bot, UserRound, X, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../api/client.js";

const STATUS_LABEL = {
  initiating: "Starting call...",
  calling: "Calling you...",
  dialing_contractor: "Calling contractor...",
  connected: "Connected — you're live",
  ai_active: "AI is talking...",
  reconnecting: "Reconnecting you...",
  ended: "Call ended",
};

const STATUS_COLOR = {
  initiating: "#6b7280",
  calling: "#f59e0b",
  dialing_contractor: "#f59e0b",
  connected: "#16a34a",
  ai_active: "#7c3aed",
  reconnecting: "#2563eb",
  ended: "#6b7280",
};

function formatPhone(raw) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === "1") return `+${d}`;
  return raw;
}

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function DemoCallPanel() {
  const [open, setOpen] = useState(false);
  const [contractorPhone, setContractorPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState(null);
  const [aiStartedAt, setAiStartedAt] = useState(null);
  const [aiSeconds, setAiSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback((startMs) => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setAiSeconds(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
  }, [stopTimer]);

  const pollStatus = useCallback((sid) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api(`/api/demo-call/status/${sid}`);
        setStatus(data.status);
        if (data.aiStartedAt) {
          setAiStartedAt(data.aiStartedAt);
          startTimer(data.aiStartedAt);
        }
        if (data.status !== "ai_active") {
          stopTimer();
        }
        if (data.status === "ended") {
          stopPolling();
        }
      } catch {
        // ignore transient errors
      }
    }, 2000);
  }, [stopPolling, stopTimer, startTimer]);

  useEffect(() => {
    return () => { stopPolling(); stopTimer(); };
  }, [stopPolling, stopTimer]);

  async function startCall() {
    if (!contractorPhone.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const { sessionId: sid } = await api("/api/demo-call/start", {
        method: "POST",
        body: JSON.stringify({
          contractorPhone: formatPhone(contractorPhone),
          businessName: businessName.trim() || undefined,
        }),
      });
      setSessionId(sid);
      setStatus("calling");
      setAiSeconds(0);
      pollStatus(sid);
    } catch (e) {
      setError(e.message || "Failed to start call");
    } finally {
      setLoading(false);
    }
  }

  async function handToAI() {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      await api("/api/demo-call/hand-to-ai", { method: "POST", body: JSON.stringify({ sessionId }) });
      setStatus("ai_active");
      const now = Date.now();
      setAiStartedAt(now);
      startTimer(now);
    } catch (e) {
      setError(e.message || "Failed to hand to AI");
    } finally {
      setLoading(false);
    }
  }

  async function reconnect() {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      await api("/api/demo-call/reconnect", { method: "POST", body: JSON.stringify({ sessionId }) });
      setStatus("reconnecting");
      stopTimer();
    } catch (e) {
      setError(e.message || "Failed to reconnect");
    } finally {
      setLoading(false);
    }
  }

  async function endCall() {
    if (sessionId) {
      await api("/api/demo-call/end", { method: "POST", body: JSON.stringify({ sessionId }) }).catch(() => {});
    }
    stopPolling();
    stopTimer();
    setSessionId(null);
    setStatus(null);
    setAiStartedAt(null);
    setAiSeconds(0);
    setError(null);
  }

  const isActive = sessionId && status && status !== "ended";
  const canHandToAI = status === "connected";
  const canReconnect = status === "ai_active" || status === "reconnecting";
  const statusColor = STATUS_COLOR[status] || "#6b7280";

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 1000,
      fontFamily: "system-ui, -apple-system, sans-serif",
      width: open ? 320 : "auto",
    }}>
      {/* Collapsed button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: isActive ? statusColor : "#0f172a",
            color: "#fff", border: "none", borderRadius: 50,
            padding: "12px 20px", cursor: "pointer",
            fontWeight: 700, fontSize: "0.875rem",
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            transition: "all 0.2s",
          }}
        >
          <Phone size={16} />
          {isActive ? STATUS_LABEL[status] || status : "Demo Call"}
          {status === "ai_active" && (
            <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: 10, padding: "1px 7px", fontSize: "0.75rem" }}>
              {formatTimer(aiSeconds)}
            </span>
          )}
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div style={{
          background: "#fff", borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          border: "1px solid #e5e7eb", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            background: "#0f172a", color: "#fff",
            padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: "0.95rem" }}>
              <Phone size={15} />
              Live Demo Call
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isActive && (
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: statusColor, boxShadow: `0 0 6px ${statusColor}`,
                }} />
              )}
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 2 }}>
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          <div style={{ padding: 18 }}>
            {/* Status bar when active */}
            {isActive && (
              <div style={{
                background: `${statusColor}15`, border: `1px solid ${statusColor}40`,
                borderRadius: 8, padding: "8px 12px", marginBottom: 14,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", fontWeight: 600, color: statusColor }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor }} />
                  {STATUS_LABEL[status] || status}
                </div>
                {status === "ai_active" && (
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: statusColor, fontVariantNumeric: "tabular-nums" }}>
                    {formatTimer(aiSeconds)} / 4:00
                  </span>
                )}
              </div>
            )}

            {/* Input form — only when no active session */}
            {!isActive && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                    Contractor's Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="(555) 555-5555"
                    value={contractorPhone}
                    onChange={(e) => setContractorPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && startCall()}
                    style={{
                      width: "100%", padding: "9px 12px", border: "1.5px solid #d1d5db",
                      borderRadius: 8, fontSize: "0.9rem", outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                    Their Business Name <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mike's Plumbing"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    style={{
                      width: "100%", padding: "9px 12px", border: "1.5px solid #d1d5db",
                      borderRadius: 8, fontSize: "0.9rem", outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: "0.82rem", color: "#dc2626" }}>
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {!isActive && (
                <button
                  onClick={startCall}
                  disabled={loading || !contractorPhone.trim()}
                  style={{
                    background: loading || !contractorPhone.trim() ? "#e5e7eb" : "#0f172a",
                    color: loading || !contractorPhone.trim() ? "#9ca3af" : "#fff",
                    border: "none", borderRadius: 9, padding: "11px 0",
                    fontWeight: 700, fontSize: "0.9rem", cursor: loading || !contractorPhone.trim() ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    transition: "all 0.15s",
                  }}
                >
                  <Phone size={15} />
                  {loading ? "Starting..." : "Start Demo Call"}
                </button>
              )}

              {canHandToAI && (
                <button
                  onClick={handToAI}
                  disabled={loading}
                  style={{
                    background: loading ? "#e5e7eb" : "#7c3aed",
                    color: loading ? "#9ca3af" : "#fff",
                    border: "none", borderRadius: 9, padding: "11px 0",
                    fontWeight: 700, fontSize: "0.9rem", cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    transition: "all 0.15s",
                  }}
                >
                  <Bot size={15} />
                  {loading ? "Handing off..." : "Leave — Let AI Handle"}
                </button>
              )}

              {canReconnect && (
                <button
                  onClick={reconnect}
                  disabled={loading}
                  style={{
                    background: loading ? "#e5e7eb" : "#16a34a",
                    color: loading ? "#9ca3af" : "#fff",
                    border: "none", borderRadius: 9, padding: "11px 0",
                    fontWeight: 700, fontSize: "0.9rem", cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    transition: "all 0.15s",
                  }}
                >
                  <UserRound size={15} />
                  {loading ? "Joining..." : "Join Call"}
                </button>
              )}

              {isActive && (
                <button
                  onClick={endCall}
                  style={{
                    background: "#fff", color: "#dc2626",
                    border: "1.5px solid #fecaca", borderRadius: 9, padding: "9px 0",
                    fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "all 0.15s",
                  }}
                >
                  <PhoneOff size={14} />
                  End Call
                </button>
              )}
            </div>

            {/* How-to hint */}
            {!isActive && (
              <div style={{ marginTop: 14, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5 }}>
                <strong style={{ color: "#374151" }}>How it works:</strong> Twilio calls your phone first. Once you're on, it calls the contractor. When you're ready, hit <strong>Hand to AI</strong> — you go on hold and the AI takes over. Hit <strong>Take Back Call</strong> to reconnect and close.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
