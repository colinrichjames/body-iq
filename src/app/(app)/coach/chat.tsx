"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { btnPrimary, field } from "@/components/ui";
import { STARTERS, type ActionCard, type ActionStatus, type Reply } from "@/lib/coach-chat";
import { askCoach } from "./actions";
import { confirmAction, dismissAction, undoAction } from "./confirm";

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

const STATUS_TEXT: Record<ActionStatus, string> = { proposed: "Waiting for you", applied: "Done", dismissed: "Dismissed", undone: "Undone", failed: "Not done" };

/** One proposed change. Confirm or dismiss it; once applied it can be undone. */
function ActionCardView({ card, onChange, onFollowUp }: { card: ActionCard; onChange: (c: ActionCard) => void; onFollowUp?: (text: string, actions: ActionCard[]) => void }) {
  const [busy, setBusy] = useState(false);
  async function run(fn: (id: string) => Promise<{ ok: boolean; status: ActionStatus; message: string; followUp?: { text: string; actions: ActionCard[] } }>) {
    setBusy(true);
    try {
      const r = await fn(card.id);
      onChange({ ...card, status: r.status, result: r.message });
      if (r.followUp) onFollowUp?.(r.followUp.text, r.followUp.actions);
    } catch {
      onChange({ ...card, result: "I couldn't reach the server. Nothing was changed." });
    }
    setBusy(false);
  }
  return (
    <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3" data-testid="action-card">
      <p className="font-medium text-zinc-100">{card.title}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
        {card.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-zinc-500">{STATUS_TEXT[card.status]}{card.result && card.status !== "proposed" ? `: ${card.result}` : card.result ? ` - ${card.result}` : ""}</p>
      {card.status === "proposed" && (
        <p className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={() => void run(confirmAction)} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-zinc-950 disabled:opacity-50">
            Confirm
          </button>
          <button type="button" disabled={busy} onClick={() => void run(dismissAction)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 disabled:opacity-50">
            Dismiss
          </button>
        </p>
      )}
      {card.status === "applied" && (
        <button type="button" disabled={busy} onClick={() => void run(undoAction)} className="mt-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 disabled:opacity-50">
          Undo
        </button>
      )}
    </div>
  );
}

/** The coach's one message for today. It comes from the server (saved per day), so it isn't kept in this device's chat. */
function ProactiveNote({ reply }: { reply: Reply }) {
  const [card, setCard] = useState<ActionCard[]>(reply.actions ?? []);
  return (
    <div className="mb-4 rounded-2xl border border-emerald-700/50 bg-emerald-950/20 px-4 py-3 text-sm text-zinc-200" data-testid="proactive">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">From your coach today</p>
      <p className="mt-1">{reply.text}</p>
      {reply.lines && (
        <ul className="mt-2 space-y-1 text-zinc-300">
          {reply.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {card.map((c) => (
        <ActionCardView key={c.id} card={c} onChange={(nc) => setCard((cur) => cur.map((a) => (a.id === nc.id ? nc : a)))} />
      ))}
    </div>
  );
}

/** The coach conversation. Kept on this device only; every answer comes from the server, built from your logged data. */
export function CoachChat({ initialQuestion, workoutId, proactive }: { initialQuestion?: string; workoutId?: string; proactive?: Reply | null }) {
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
      {proactive && <ProactiveNote reply={proactive} />}
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
              {m.reply?.actions?.map((c) => (
                <ActionCardView
                  key={c.id}
                  card={c}
                  onFollowUp={(t, actions) => setMsgs((cur) => [...cur, { id: next.current++, from: "coach", text: t, reply: { text: t, actions } }])}
                  onChange={(nc) => setMsgs((cur) => cur.map((x) => (x.id === m.id && x.reply ? { ...x, reply: { ...x.reply, actions: x.reply.actions?.map((a) => (a.id === nc.id ? nc : a)) } } : x)))}
                />
              ))}
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
