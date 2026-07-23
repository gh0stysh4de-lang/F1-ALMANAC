"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, ChevronDown, ChevronUp, Info } from "lucide-react";

// Floating AI Data Chat. Talks to /api/ask (Claude + BigQuery tools + guarded
// text-to-SQL fallback — see lib/ai/tools.ts and lib/ai/schema_semantic.md).
//
// History lives only in React state for now (no persistence) — matches the
// "React state, no persistence yet" decision from the hand-off doc.

type Role = "user" | "assistant";

type GeneratedSql = { sql: string; ok: boolean; bytesProcessed?: number };

type ChatMessage = {
  id: string;
  role: Role;
  content: string;АМ
  generatedSql?: GeneratedSql[];
  error?: boolean;
};

const PANEL_TITLE = "rgba(199, 197, 208, 0.85)";
const BODY_TEXT = "rgba(232, 230, 240, 0.88)";
const MUTED_TEXT = "rgba(255, 255, 255, 0.45)";

// Input auto-grow: starts roomy (not a cramped one-liner), grows silently
// with the question, and only becomes internally scrollable once it's
// genuinely long — no scroll thumb flashing on a two-word message.
const TEXTAREA_MIN_HEIGHT = 60; // px, ~3 lines
const TEXTAREA_MAX_HEIGHT = 160; // px, ~8 lines before internal scroll kicks in

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function SqlDisclosure({ items }: { items: GeneratedSql[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] italic transition-opacity hover:opacity-80"
        style={{ color: MUTED_TEXT }}
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {items.length === 1 ? "SQL used" : `SQL used (${items.length})`}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {items.map((item, i) => (
            <pre
              key={i}
              className="overflow-x-auto whitespace-pre-wrap break-words rounded-[6px] p-2 text-[10.5px] leading-[1.4]"
              style={{
                background: "rgba(0, 0, 0, 0.35)",
                border: `0.5px solid rgba(255, 255, 255, ${item.ok ? "0.08" : "0.15"})`,
                color: item.ok ? "rgba(200, 210, 235, 0.85)" : "rgba(240, 140, 140, 0.85)",
              }}
            >
              {item.sql}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Grow the textarea with content, up to TEXTAREA_MAX_HEIGHT — past that,
  // the browser's own internal scroll takes over (overflow-y set below).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, [input]);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content: question };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: data.error ?? "Something went wrong answering that.",
            error: true,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: data.answer as string,
          generatedSql: (data.generatedSql ?? []) as GeneratedSql[],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: "Couldn't reach the server — check your connection and try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-[200] flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[14px]"
          style={{
            background: "rgba(18, 18, 32, 0.85)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "0.5px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
          }}
        >
          {/* top glow, consistent with GlassPanel */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent 10%, rgba(160,120,240,0.15) 30%, rgba(255,255,255,0.1) 50%, rgba(160,120,240,0.15) 70%, transparent 90%)",
            }}
          />

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <div className="flex items-center gap-2">
              <Sparkles size={14} style={{ color: "rgba(160,120,240,0.9)" }} />
              <h2
                className="text-[13px] font-semibold italic tracking-[0.3px]"
                style={{ color: PANEL_TITLE }}
              >
                Ask the Almanac
              </h2>
            </div>
            <div
              className="relative"
              onMouseEnter={() => setInfoOpen(true)}
              onMouseLeave={() => setInfoOpen(false)}
            >
              <button
                type="button"
                onClick={() => setInfoOpen((v) => !v)}
                className="rounded-full p-1 transition-colors hover:bg-white/10"
                aria-label="How the assistant answers"
                aria-expanded={infoOpen}
              >
                <Info size={16} style={{ color: MUTED_TEXT }} />
              </button>

              {infoOpen && (
                <div
                  role="tooltip"
                  className="absolute right-0 top-[calc(100%+8px)] z-[10] w-[280px] rounded-[10px] p-3 text-[12px] leading-[1.5]"
                  style={{
                    background: "rgba(24, 24, 40, 0.97)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: "0.5px solid rgba(255, 255, 255, 0.14)",
                    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
                    color: "rgba(232, 230, 240, 0.9)",
                  }}
                >
                  <p
  className="mb-2 font-bold italic"
  style={{ color: "rgba(232, 230, 240, 0.82)" }}
>
  How answers are produced
</p>
                  <p className="mb-2">
                    Factual answers come straight from the F1 database — the
                    assistant writes a query, runs it, and reports what comes
                    back. You can expand{" "}
                    <span className="italic">SQL used</span> under any answer to
                    see the exact query.
                  </p>
                  <p style={{ color: MUTED_TEXT }}>
                    Anything it adds from general F1 knowledge is not checked
                    against the database and is less reliable — it flags those
                    parts when it does so.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 pb-2">
            {messages.length === 0 && (
              <p className="pt-8 text-center text-[12px] italic" style={{ color: MUTED_TEXT }}>
                Ask about any driver, team, race, or season — even things not
                shown on the dashboard.
              </p>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[88%] rounded-[10px] px-3 py-2 text-[13px] leading-[1.45]"
                  style={{
                    background:
                      m.role === "user"
                        ? "rgba(160, 120, 240, 0.18)"
                        : m.error
                          ? "rgba(240, 100, 100, 0.1)"
                          : "rgba(255, 255, 255, 0.05)",
                    border:
                      m.role === "user"
                        ? "0.5px solid rgba(160, 120, 240, 0.3)"
                        : "0.5px solid rgba(255, 255, 255, 0.08)",
                    color: m.error ? "rgba(240, 160, 160, 0.9)" : BODY_TEXT,
                  }}
                >
                  <span className="whitespace-pre-wrap">{m.content}</span>
                  {m.generatedSql && <SqlDisclosure items={m.generatedSql} />}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] italic"
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "0.5px solid rgba(255, 255, 255, 0.08)",
                    color: MUTED_TEXT,
                  }}
                >
                  <Loader2 size={12} className="animate-spin" />
                  thinking…
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 border-t border-white/[0.08] p-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="e.g. How did Alonso do against his teammates in 2007?"
              className="flex-1 resize-none overflow-y-auto rounded-[8px] bg-white/[0.04] px-3 py-2 text-[13px] outline-none placeholder:italic placeholder:text-white/30"
              style={{
                color: BODY_TEXT,
                minHeight: TEXTAREA_MIN_HEIGHT,
                maxHeight: TEXTAREA_MAX_HEIGHT,
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
              style={{ background: "rgba(160, 120, 240, 0.35)" }}
              aria-label="Send"
            >
              <Send size={14} style={{ color: BODY_TEXT }} />
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[200] flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-105"
        style={{
          background: "rgba(120, 120, 155, 0.12)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "0.5px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        }}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
      >
        {open ? (
          <X size={20} style={{ color: BODY_TEXT }} />
        ) : (
          <Sparkles size={20} style={{ color: "rgba(160,120,240,0.9)" }} />
        )}
      </button>
    </>
  );
}
