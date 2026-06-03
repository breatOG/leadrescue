import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Radio, Square, Video } from "lucide-react";
import { api } from "../api/client.js";
import { DemoSafeText, displayLeadName, redactDemoText } from "../components/RedactedPhone.jsx";
import { formatBusinessDateTime } from "../utils/dates.js";

function scrubPhones(value) {
  return redactDemoText(String(value || "").replace(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g, "[phone hidden]"));
}

function channelIcon(message) {
  return message?.direction === "inbound" ? "Customer" : "AI";
}

function messageTime(message) {
  return formatBusinessDateTime(message.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function LiveCallDemo() {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const bottomRef = useRef(null);

  async function loadLatestVoiceLead() {
    const { leads } = await api("/api/leads");
    const candidate = leads.find((item) => item.source === "missed_call" || item.messages?.[0]?.channel === "voice") || leads[0];
    if (!candidate) {
      setLead(null);
      setLoading(false);
      return;
    }
    const data = await api(`/api/leads/${candidate.id}`);
    setLead(data.lead);
    setLoading(false);
  }

  useEffect(() => {
    loadLatestVoiceLead().catch((err) => {
      setError(err.message);
      setLoading(false);
    });
    const interval = setInterval(() => {
      loadLatestVoiceLead().catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lead?.messages?.length]);

  const voiceMessages = useMemo(
    () => (lead?.messages || []).filter((message) => message.channel === "voice" && message.body !== "[call started]"),
    [lead]
  );

  async function startRecording() {
    setError("");
    setDownloadUrl("");
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      setError("This browser cannot record the screen. Use Chrome or Edge.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false
      });
      chunksRef.current = [];
      const options = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? { mimeType: "video/webm;codecs=vp9" }
        : MediaRecorder.isTypeSupported("video/webm")
          ? { mimeType: "video/webm" }
          : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setDownloadUrl(URL.createObjectURL(blob));
        setRecording(false);
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      setError(err.message || "Recording was cancelled.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  const startedAt = voiceMessages[0]?.createdAt;
  const lastAt = voiceMessages[voiceMessages.length - 1]?.createdAt;

  return (
    <div className="live-call-demo">
      <header className="live-call-toolbar">
        <div>
          <span className={`live-dot ${voiceMessages.length ? "active" : ""}`} />
          <h1>Live Voice Call</h1>
          <p>
            {lead ? scrubPhones(displayLeadName(lead, "New caller")) : "Waiting for the next caller"}
            {startedAt && ` - ${messageTime({ createdAt: startedAt })}`}
            {lastAt && lastAt !== startedAt && ` to ${messageTime({ createdAt: lastAt })}`}
          </p>
        </div>
        <div className="live-call-actions">
          {recording ? (
            <button className="button danger" onClick={stopRecording}>
              <Square size={16} /> Stop recording
            </button>
          ) : (
            <button className="button" onClick={startRecording}>
              <Video size={16} /> Record demo
            </button>
          )}
          {downloadUrl && (
            <a className="ghost live-download" href={downloadUrl} download="leadrescue-live-call-demo.webm">
              <Download size={16} /> Download video
            </a>
          )}
        </div>
      </header>

      {error && <div className="live-call-error">{error}</div>}

      <main className="live-call-stage">
        <section className="live-call-panel">
          <div className="conversation-session-header">
            <strong>{voiceMessages.length ? "Voice call in progress" : "Waiting for call audio"}</strong>
            <span>{voiceMessages.length} live transcript line{voiceMessages.length === 1 ? "" : "s"}</span>
          </div>

          <div className="conversation-brief">
            <div>
              <span>AI summary for this conversation</span>
              <p>{lead?.aiSummary ? scrubPhones(lead.aiSummary) : "Summary will update when the call ends."}</p>
            </div>
            <div>
              <span>Privacy filter</span>
              <p>Phone numbers, addresses, and ZIP codes are hidden on this demo screen.</p>
            </div>
          </div>

          <div className="message-thread session-only live-thread">
            {loading && <p className="live-empty">Loading the latest call...</p>}
            {!loading && !voiceMessages.length && (
              <div className="live-waiting">
                <Radio size={24} />
                <p>Call 317 790 2426, then keep this page open. New AI and customer lines will appear here live.</p>
              </div>
            )}
            {voiceMessages.map((message) => (
              <div className={`message ${message.direction}`} key={message.id}>
                <small>
                  {channelIcon(message)} - {messageTime(message)}
                </small>
                <p><DemoSafeText>{scrubPhones(message.body)}</DemoSafeText></p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </section>
      </main>
    </div>
  );
}
