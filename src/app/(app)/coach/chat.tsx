"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { btnPrimary, field } from "@/components/ui";
import { STARTERS, type Reply } from "@/lib/coach-chat";
import { askCoach } from "./actions";

type Msg = { id: number; from: "you" | "coach"; text: string; reply?: Reply };

const KEY = "bodyiq-coach-chat";

function load(): Msg[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.slice(-30) : [];
  } catch {
    return [];
  }
}

/** The coach conversation. Kept on this device only; every answer comes from the server, built from your logged data. */
export function CoachChat({ initialQuestion, workoutId }: { initialQuestion?: string; workoutId?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const next = useRef(1);
  const ready = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    setBusy(true);
    const mine: Msg = { id: next.current++, from: "you", text: question };
    setMsgs((cur) => [...cur, mine]);
    let reply: Reply;
    try {
      reply = await askCoach(question, { workoutId });
    } catch {
      reply = { text: "I couldn't reach the server, so I won't guess. Check your connection and try again." };
    }
    setMsgs((cur) => [...cur, { id: next.current++, from: "coach", text: reply.text, reply }]);
    setBusy(false);
  }

  // Restore this device's conversation, then answer the question that came in from another screen (once).
  useEffect(() => {
    const saved = load();
    next.current = saved.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    queueMicrotask(() => {
      setMsgs(saved);
      ready.current = true;
      if (initialQuestion && !asked.current) {
        asked.current = true;
        void send(initialQuestion);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30)));
    } catch {
      // storage unavailable
    }
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [msgs]);

  return (
    <div className="mt-4">
      <ul className="space-y-3" aria-live="polite">
        {msgs.length === 0 && (
          <li className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
            Ask me about your sessions, fuel, lifts, weight, score or readiness. I answer from what you&apos;ve logged, and I tell you when I don&apos;t have the data.
          </li>
        )}
        {msgs.map((m) => (
          <li key={m.id} className={m.from === "you" ? "flex justify-end" : ""}>
            <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm ${m.from === "you" ? "bg-emerald-500/20 text-emerald-100" : "border border-zinc-800 bg-zinc-900/60 text-zinc-200"}`}>
              <p>{m.text}</p>
              {m.reply?.lines && (
                <ul className="mt-2 space-y-1 text-zinc-300">
                  {m.reply.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
              {m.reply?.links && (
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {m.reply.links.map((l) => (
                    <Link key={l.href + l.label} href={l.href} className="text-emerald-400 underline">
                      {l.label}
                    </Link>
                  ))}
                </p>
              )}
              {m.reply?.suggestions && (
                <p className="mt-2 flex flex-wrap gap-2">
                  {m.reply.suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 active:bg-zinc-800">
                      {s}
                    </button>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
        {busy && <li className="text-sm text-zinc-500">Checking your data...</li>}
      </ul>
      <div ref={bottom} />

      {msgs.length === 0 && (
        <p className="mt-3 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 active:bg-zinc-800">
              {s}
            </button>
          ))}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="mt-4 flex gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask your coach" aria-label="Ask your coach" maxLength={300} className={`${field} flex-1`} />
        <button type="submit" disabled={busy || !text.trim()} className={`${btnPrimary} px-5 disabled:opacity-50`}>
          Ask
        </button>
      </form>
      {msgs.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setMsgs([]);
            try {
              localStorage.removeItem(KEY);
            } catch {
              // storage unavailable
            }
          }}
          className="mt-3 text-xs text-zinc-500"
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}
