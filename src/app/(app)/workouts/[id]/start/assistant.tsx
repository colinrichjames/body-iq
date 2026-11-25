"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Workout } from "@/lib/types";
import { btnGhost, btnPrimary, field } from "@/components/ui";
import { finishWorkout, type SetLog } from "../../actions";

type Step = {
  exercise: string;
  setNumber: number;
  totalSets: number;
  reps?: number;
  seconds?: number;
  weight?: number;
  note?: string;
  restAfter: number;
};

function buildSteps(w: Workout): Step[] {
  const s = w.structure;
  const ex = s?.exercises ?? [];
  if (!ex.length) return [];
  const steps: Step[] = [];
  const defaultRest = s?.rest_sec ?? 60;
  if (s?.rounds) {
    for (let r = 1; r <= s.rounds; r++) {
      ex.forEach((e, i) => {
        const last = i === ex.length - 1;
        steps.push({
          exercise: e.name,
          setNumber: r,
          totalSets: s.rounds!,
          reps: e.reps,
          seconds: e.seconds,
          weight: e.weight_lb,
          note: e.note,
          restAfter: last ? (r === s.rounds ? 0 : (e.rest_sec ?? defaultRest)) : 0,
        });
      });
    }
  } else {
    ex.forEach((e, ei) => {
      const n = e.sets ?? 1;
      for (let k = 1; k <= n; k++) {
        const isVeryLast = ei === ex.length - 1 && k === n;
        steps.push({
          exercise: e.name,
          setNumber: k,
          totalSets: n,
          reps: e.reps,
          seconds: e.seconds,
          weight: e.weight_lb,
          note: e.note,
          restAfter: isVeryLast ? 0 : (e.rest_sec ?? defaultRest),
        });
      }
    });
  }
  return steps;
}

const fmt = (totalSec: number) => {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Assistant({ workout, lastWeights }: { workout: Workout; lastWeights: Record<string, number> }) {
  const router = useRouter();
  const steps = useMemo(() => buildSteps(workout), [workout]);
  const blocks = workout.structure?.blocks ?? [];
  const mode: "sets" | "blocks" | "timer" = steps.length ? "sets" : blocks.length ? "blocks" : "timer";

  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [stepIndex, setStepIndex] = useState(0);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [blockIndex, setBlockIndex] = useState(0);
  const [blockStart, setBlockStart] = useState(() => Date.now());
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [finished, setFinished] = useState(false);
  const prefill = (i: number, done: SetLog[]) => {
    const st = steps[i];
    if (!st) return { reps: "", weight: "" };
    const prev = [...done].reverse().find((l) => l.exercise === st.exercise && l.weight_lb !== null)?.weight_lb;
    const w = prev ?? lastWeights[st.exercise] ?? st.weight;
    return { reps: String(st.seconds ?? st.reps ?? ""), weight: w !== undefined && w !== null ? String(w) : "" };
  };
  const [reps, setReps] = useState(() => prefill(0, []).reps);
  const [weight, setWeight] = useState(() => prefill(0, []).weight);
  const [rpe, setRpe] = useState("");
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buzzed = useRef(false);

  // 1 s ticker. Times are derived from timestamps, so backgrounding the tab can't drift them.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Keep the screen awake while working out.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // not supported or denied
      }
    };
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  const step = steps[stepIndex];

  const elapsedSec = (now - startedAt) / 1000;
  const restLeft = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0;
  const resting = restEnd !== null;

  // Buzz once when rest ends.
  useEffect(() => {
    if (resting && restLeft === 0 && !buzzed.current) {
      buzzed.current = true;
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [resting, restLeft]);

  const goFinish = useCallback(() => {
    setMinutes(String(Math.max(1, Math.round((Date.now() - startedAt) / 60000))));
    setFinished(true);
  }, [startedAt]);

  function completeSet() {
    if (!step) return;
    const r = reps.trim() === "" ? null : Number(reps);
    const w = weight.trim() === "" ? null : Number(weight);
    const nextLogs = [
      ...logs,
      { exercise: step.exercise, set_number: step.setNumber, reps: Number.isFinite(r) ? r : null, weight_lb: Number.isFinite(w) ? w : null },
    ];
    setLogs(nextLogs);
    navigator.vibrate?.(30);
    if (stepIndex >= steps.length - 1) return goFinish();
    if (step.restAfter > 0) {
      buzzed.current = false;
      setRestEnd(Date.now() + step.restAfter * 1000);
    }
    const next = prefill(stepIndex + 1, nextLogs);
    setReps(next.reps);
    setWeight(next.weight);
    setStepIndex((i) => i + 1);
  }

  function nextBlock() {
    navigator.vibrate?.(30);
    if (blockIndex >= blocks.length - 1) return goFinish();
    setBlockIndex((i) => i + 1);
    setBlockStart(Date.now());
  }

  async function save() {
    setSaving(true);
    setError(null);
    const m = Number(minutes);
    const res = await finishWorkout({
      id: workout.id,
      sets: logs,
      actualMinutes: Number.isFinite(m) && minutes !== "" ? m : null,
      rpe: rpe === "" ? null : Number(rpe),
      notes,
    });
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    router.push(`/workouts/${workout.id}`);
    router.refresh();
  }

  function quit() {
    if (logs.length === 0 || confirm("Leave without saving? Logged sets will be lost.")) router.push(`/workouts/${workout.id}`);
  }

  // ----------------------------------------------------------------- finish
  if (finished) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Nice work</h1>
        <p className="mt-1 text-zinc-400">
          {workout.title} &middot; {logs.length} set{logs.length === 1 ? "" : "s"} logged
        </p>
        <div className="mt-6 space-y-3">
          <label className="block text-sm text-zinc-400">
            Duration (min)
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" inputMode="numeric" className={`${field} mt-1`} />
          </label>
          <label className="block text-sm text-zinc-400">
            How hard was it? (RPE 1-10)
            <select value={rpe} onChange={(e) => setRpe(e.target.value)} className={`${field} mt-1`}>
              <option value="">Skip</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes" className={field} />
          {error && <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button onClick={save} disabled={saving} className={`${btnPrimary} w-full`}>
            {saving ? "Saving..." : "Save workout"}
          </button>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------- rest
  if (mode === "sets" && resting && step) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <Header title={workout.title} elapsed={elapsedSec} onQuit={quit} />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-widest text-zinc-500">{restLeft === 0 ? "Go" : "Rest"}</p>
          <p className={`mt-2 text-8xl font-semibold tabular-nums ${restLeft === 0 ? "text-emerald-400" : ""}`}>{fmt(restLeft)}</p>
          <p className="mt-6 text-zinc-400">
            Next: {step.exercise}, set {step.setNumber} of {step.totalSets}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setRestEnd((e) => (e ?? Date.now()) + 15000)} className={btnGhost}>
            +15 s
          </button>
          <button onClick={() => setRestEnd(null)} className={btnPrimary}>
            Skip rest
          </button>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------- sets
  if (mode === "sets" && step) {
    const nextUp = steps[stepIndex + 1];
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <Header title={workout.title} elapsed={elapsedSec} onQuit={quit} />
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-emerald-500" style={{ width: `${(stepIndex / steps.length) * 100}%` }} />
        </div>
        <div className="flex-1 pt-8">
          <p className="text-sm text-zinc-500">
            Set {step.setNumber} of {step.totalSets}
            {workout.structure?.rounds ? " (round)" : ""}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{step.exercise}</h1>
          <p className="mt-2 text-zinc-400">
            Target: {step.seconds ? `${step.seconds} s` : `${step.reps ?? "-"} reps`}
            {step.weight ? ` @ ${step.weight} lb` : ""}
          </p>
          {step.note && <p className="mt-1 text-sm text-zinc-500">{step.note}</p>}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="text-sm text-zinc-400">
              {step.seconds ? "Seconds" : "Reps"}
              <input value={reps} onChange={(e) => setReps(e.target.value)} type="number" inputMode="numeric" className={`${field} mt-1 text-2xl`} />
            </label>
            <label className="text-sm text-zinc-400">
              Weight (lb)
              <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" inputMode="decimal" step="2.5" className={`${field} mt-1 text-2xl`} />
            </label>
          </div>
        </div>
        {nextUp && (
          <p className="mb-3 text-center text-sm text-zinc-500">
            {step.restAfter > 0 ? `Then rest ${step.restAfter}s · ` : "Then "}
            {nextUp.exercise}
          </p>
        )}
        <button onClick={completeSet} className={`${btnPrimary} py-4 text-lg`}>
          {stepIndex >= steps.length - 1 ? "Finish" : "Done set"}
        </button>
      </main>
    );
  }

  // ----------------------------------------------------------------- blocks
  if (mode === "blocks") {
    const b = blocks[blockIndex];
    const blockSec = (now - blockStart) / 1000;
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <Header title={workout.title} elapsed={elapsedSec} onQuit={quit} />
        <p className="mt-2 text-sm text-zinc-500">
          Block {blockIndex + 1} of {blocks.length}
        </p>
        <div className="flex-1 pt-4">
          <h1 className="text-3xl font-semibold tracking-tight">{b.name}</h1>
          {b.minutes ? <p className="mt-1 text-zinc-500">Target {b.minutes} min</p> : null}
          <p className="mt-3 text-lg text-zinc-300">{b.detail}</p>
          <p
            className={`mt-8 text-center text-7xl font-semibold tabular-nums ${b.minutes && blockSec > b.minutes * 60 ? "text-amber-400" : ""}`}
          >
            {fmt(blockSec)}
          </p>
        </div>
        {blocks[blockIndex + 1] && <p className="mb-3 text-center text-sm text-zinc-500">Next: {blocks[blockIndex + 1].name}</p>}
        <button onClick={nextBlock} className={`${btnPrimary} py-4 text-lg`}>
          {blockIndex >= blocks.length - 1 ? "Finish" : "Next block"}
        </button>
      </main>
    );
  }

  // ------------------------------------------------------------------ timer
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <Header title={workout.title} elapsed={null} onQuit={quit} />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {workout.description && <p className="mb-8 whitespace-pre-line text-zinc-400">{workout.description}</p>}
        <p className="text-8xl font-semibold tabular-nums">{fmt(elapsedSec)}</p>
      </div>
      <button onClick={goFinish} className={`${btnPrimary} py-4 text-lg`}>
        Finish
      </button>
    </main>
  );
}

function Header({ title, elapsed, onQuit }: { title: string; elapsed: number | null; onQuit: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <button onClick={onQuit} className="text-sm text-zinc-400 active:text-zinc-200">
        Quit
      </button>
      <p className="truncate text-sm text-zinc-400">{title}</p>
      <p className="w-12 text-right text-sm tabular-nums text-zinc-400">{elapsed === null ? "" : fmt(elapsed)}</p>
    </header>
  );
}
