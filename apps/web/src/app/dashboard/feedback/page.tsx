"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AIChatInput } from "@/components/ui/ai-chat-input";

// ── Types ─────────────────────────────────────────────────────────────────────

type HistoryTurn = { question: string; answer: string };

type Message =
  | { id: string; role: "user";    content: string }
  | { id: string; role: "analyst"; content: string }
  | { id: string; role: "thinking" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

/** Render **bold** markdown inline */
function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n+/).filter(p => p.trim());
  return (
    <>
      {paragraphs.map((p, pi) => {
        const isBullet = /^[-•]\s/.test(p.trimStart()) || /^\d+\.\s/.test(p.trimStart());
        const parts = p.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : <span key={i}>{part}</span>
        );
        return (
          <p key={pi} style={{
            margin: 0,
            marginTop: pi > 0 ? 10 : 0,
            paddingLeft: isBullet ? 10 : 0,
            borderLeft: isBullet ? "2px solid #bfdbfe" : "none",
            fontSize: 14,
            lineHeight: 1.65,
            color: "#0f172a",
          }}>
            {parts}
          </p>
        );
      })}
    </>
  );
}

// ── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What's the #1 reason subscribers cancel?",
  "Which offers are actually working?",
  "Why do high-value subscribers leave?",
  "What should I fix to reduce churn this month?",
  "Are price-sensitive users worth saving?",
  "What do subscribers say about the product?",
];

// ── Message bubbles ───────────────────────────────────────────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      <div style={{
        maxWidth: "72%",
        background: "#2563eb",
        color: "#fff",
        borderRadius: "16px 16px 4px 16px",
        padding: "10px 16px",
        fontSize: 14,
        lineHeight: 1.5,
        fontWeight: 500,
      }}>
        {content}
      </div>
    </div>
  );
}

function AnalystBubble({ content }: { content: string }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "flex-start" }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: "#18181b",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 2,
      }}>
        <style>{`.cs-analyst-tri{animation:cs-tri-spin 2.4s cubic-bezier(0.37,0,0.63,1) infinite}@keyframes cs-tri-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
        <svg className="cs-analyst-tri" width="18" height="18" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <polygon points="14,2 26,24 2,24" fill="none" stroke="#52525b" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="14,2 26,24 2,24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="24 60" strokeDashoffset="0" />
        </svg>
      </div>

      {/* Content card */}
      <div style={{
        flex: 1,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "4px 16px 16px 16px",
        padding: "16px 20px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          AI Analyst
        </div>
        <RichText text={content} />
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "flex-start" }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: "#18181b",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 2,
      }}>
        <svg className="cs-analyst-tri" width="18" height="18" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <polygon points="14,2 26,24 2,24" fill="none" stroke="#52525b" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="14,2 26,24 2,24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="24 60" strokeDashoffset="0" />
        </svg>
      </div>
      <div style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "4px 16px 16px 16px",
        padding: "16px 20px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}>
        {[0, 150, 300].map(delay => (
          <div key={delay} style={{
            width: 7, height: 7, borderRadius: "50%", background: "#94a3b8",
            animation: "cs-bounce 1.2s ease-in-out infinite",
            animationDelay: `${delay}ms`,
          }} />
        ))}
        <style>{`@keyframes cs-bounce { 0%,80%,100%{transform:scale(0.7);opacity:0.4} 40%{transform:scale(1);opacity:1} }`}</style>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0 16px" }}>
      <div style={{
        width: 44, height: 44,
        background: "#18181b",
        borderRadius: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 14,
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      }}>
        <svg className="cs-analyst-tri" width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <polygon points="14,2 26,24 2,24" fill="none" stroke="#52525b" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="14,2 26,24 2,24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="24 60" strokeDashoffset="0" />
        </svg>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", textAlign: "center", letterSpacing: "-0.2px" }}>
        Your AI Subscriber Analyst
      </h2>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px", maxWidth: 380, textAlign: "center", lineHeight: 1.6 }}>
        Ask anything about why subscribers cancel, which offers work, or what to improve.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: "100%" }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onSuggestion(s)} style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "11px 14px",
            fontSize: 12.5,
            color: "#475569",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            lineHeight: 1.45,
            fontWeight: 500,
            transition: "all 150ms ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = "#18181b";
              el.style.background = "#f4f4f5";
              el.style.color = "#18181b";
              el.style.boxShadow = "0 2px 10px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = "#e2e8f0";
              el.style.background = "#fff";
              el.style.color = "#475569";
              el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [history, setHistory]     = useState<HistoryTurn[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;

    setInput("");
    setError(null);

    // Add user bubble immediately
    const userMsg: Message = { id: uid(), role: "user", content: q };
    const thinkingMsg: Message = { id: uid(), role: "thinking" };
    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/feedback/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, history }),
      });

      if (!res.ok) throw new Error("Request failed");
      const data = await res.json() as { answer: string; question: string; traceId?: string };
      if (data.traceId) {
        console.log("[AI Analyst] traceId", data.traceId, " use in server logs: [feedback-search", data.traceId + "]");
      }

      const analystMsg: Message = { id: uid(), role: "analyst", content: data.answer };

      // Replace thinking bubble with analyst answer
      setMessages(prev => [...prev.filter(m => m.role !== "thinking"), analystMsg]);
      setHistory(prev => [...prev, { question: q, answer: data.answer }]);
    } catch {
      setMessages(prev => prev.filter(m => m.role !== "thinking"));
      setError("Something went wrong  please try again.");
    } finally {
      setLoading(false);
    }
  }, [loading, history]);

  const clearConversation = () => {
    setMessages([]);
    setHistory([]);
    setError(null);
    setInput("");
    inputRef.current?.focus();
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 64px)",
      background: "#f8fafc",
      padding: "0 40px",
      boxSizing: "border-box",
    }}>

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: 16,
        borderBottom: "1px solid #f1f5f9",
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#0f172a" }}>AI Analyst</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>
            Ask anything  answers from your real cancellation data
          </p>
        </div>
        {!isEmpty && (
          <button onClick={clearConversation} style={{
            background: "none",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            color: "#64748b",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "all 150ms ease",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#94a3b8";
              (e.currentTarget as HTMLButtonElement).style.color = "#374151";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0";
              (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            New conversation
          </button>
        )}
      </div>

      {/* Chat thread */}
      <style>{`.cs-thread::-webkit-scrollbar{display:none}`}</style>
      <div className="cs-thread" style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px 0 16px",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      } as React.CSSProperties}>
        {isEmpty
          ? <EmptyState onSuggestion={q => sendMessage(q)} />
          : messages.map(m => {
              if (m.role === "user")    return <UserBubble    key={m.id} content={m.content} />;
              if (m.role === "analyst") return <AnalystBubble key={m.id} content={m.content} />;
              if (m.role === "thinking") return <ThinkingBubble key={m.id} />;
            })
        }

        {/* Error inline */}
        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 10, padding: "12px 16px",
            fontSize: 13, color: "#991b1b", marginBottom: 16,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ flexShrink: 0, borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
        {!isEmpty && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {["Tell me more", "What should I do about this?", "Which subscribers are at risk?"].map(s => (
              <button key={s} onClick={() => sendMessage(s)} disabled={loading} style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20,
                padding: "5px 13px", fontSize: 12, fontWeight: 500,
                color: loading ? "#cbd5e1" : "#475569",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 150ms ease", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                fontFamily: "inherit",
              }}
                onMouseEnter={e => { if (!loading) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#7C3AED"; b.style.color = "#7C3AED"; b.style.background = "#f5f3ff"; } }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#e2e8f0"; b.style.color = "#475569"; b.style.background = "#fff"; }}
              >{s}</button>
            ))}
          </div>
        )}

        <AIChatInput
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSend={text => { sendMessage(text); }}
          loading={loading}
          disabled={loading}
        />

        <p style={{ fontSize: 11, color: "#94a3b8", margin: "8px 0 0", textAlign: "center" }}>
          Answers are based on your cancellation data only
        </p>
      </div>
    </div>
  );
}
