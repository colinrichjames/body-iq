"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Workout } from "@/lib/types";
import { btnGhost, btnPrimary, field } from "@/components/ui";
import { buildSteps } from "@/lib/steps";
import { elapsedMs as elapsedAt, pickResume } from "@/lib/progress";
import { finishWorkout, saveProgress, type SetLog } from "../../actions";

type Resume = { logs: SetLog[]; stepIndex: number; blockIndex: number; elapsedMs: number };

const fmt = (totalSec: number) => {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Assistant({ workout, lastWeights, lastTime, serverResume }: { workout: Workout; lastWeights: Record<string, number>; lastTime: Record<string, string>; serverResume: Resume | null }) {
  const router = useRouter();
  const steps = useMemo(() => buildSteps(workout), [workout]);
  const blocks = workout.structure?.blocks ?? [];
  const mode: "sets" | "blocks" | "timer" = steps.length ? "sets" : blocks.length ? "blocks" : "timer";

  const draftKey = `bodyiq-draft-${workout.id}`;
  const [now, setNow] = useState(() => Date.now());
  // Resume from the server copy or this phone's draft, whichever has more progress.
  const [saved] = useState<Resume | null>(() => {
    let local: Resume | null = null;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (d && Array.isArray(d.logs)) {
        local = { logs: d.logs, stepIndex: Number(d.stepIndex) || 0, blockIndex: Number(d.blockIndex) || 0, elapsedMs: typeof d.elapsedMs === "number" ? d.elapsedMs : 0 };
      }
    } catch {
      // storage unavailable
    }
    return pickResume(serverResume, local);
  });
  // Elapsed time only counts while this screen is open: saved time plus this visit.
  const [baseMs] = useState(saved?.elapsedMs ?? 0);
  const [segmentStart] = useState<number | null>(() => Date.now());
  const [stepIndex, setStepIndex] = useState(() => Math.min(saved?.stepIndex ?? 0, Math.max(0, steps.length - 1)));
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [blockIndex, setBlockIndex] = useState(() => Math.min(saved?.blockIndex ?? 0, Math.max(0, blocks.length - 1)));
  const [blockStart, setBlockStart] = useState(() => Date.now());
  const [logs, setLogs] = useState<SetLog[]>(() => saved?.logs ?? []);
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
  const [setRpeVal, setSetRpeVal] = useState("");
  const [distance, setDistance] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [avgPower, setAvgPower] = useState("");
  const endurance = ["run", "bike", "swim", "hyrox"].includes(workout.sport);
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
  const plates = (() => {
    const w = Number(weight);
    if (!step || !Number.isFinite(w) || w <= 45 || !/barbell|squat|deadlift|bench|press|rdl|romanian/i.test(step.exercise) || /dumbbell|goblet/i.test(step.exercise)) return null;
    let side = (w - 45) / 2;
    const out: number[] = [];
    for (const p of [45, 35, 25, 10, 5, 2.5]) while (side >= p - 1e-9) { out.push(p); side -= p; }
    return side > 0.01 ? null : out;
  })();

  const elapsedNow = elapsedAt(baseMs, segmentStart, now);
  const latest = useRef({ logs, stepIndex, blockIndex, elapsed: elapsedNow });
  useEffect(() => {
    latest.current = { logs, stepIndex, blockIndex, elapsed: elapsedNow };
  });

  // Never lose a session: keep progress on the phone until it is saved (heartbeat every 5 s).
  const beat = Math.floor(now / 5000);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ logs, stepIndex, blockIndex, elapsedMs: latest.current.elapsed }));
    } catch {
      // storage unavailable
    }
  }, [draftKey, logs, stepIndex, blockIndex, beat]);

  // Also keep it on the server so the session shows as in progress everywhere.
  const persist = useCallback(
    (over?: Partial<{ logs: SetLog[]; stepIndex: number; blockIndex: number }>) => {
      const l = latest.current;
      return saveProgress({ id: workout.id, sets: over?.logs ?? l.logs, stepIndex: over?.stepIndex ?? l.stepIndex, blockIndex: over?.blockIndex ?? l.blockIndex, elapsedMs: l.elapsed }).catch(() => ({ error: "offline" }));
    },
    [workout.id],
  );
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void persist();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persist]);

  const elapsedSec = elapsedNow / 1000;
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
    setMinutes(String(Math.max(1, Math.round(latest.current.elapsed / 60000))));
    setFinished(true);
  }, []);

  function completeSet() {
    if (!step) return;
    const r = reps.trim() === "" ? null : Number(reps);
    const w = weight.trim() === "" ? null : Number(weight);
    const nextLogs = [
      ...logs,
      { exercise: step.exercise, set_number: step.setNumber, reps: Number.isFinite(r) ? r : null, weight_lb: Number.isFinite(w) ? w : null, rpe: setRpeVal === "" ? null : Number(setRpeVal) },
    ];
    setLogs(nextLogs);
    setSetRpeVal("");
    navigator.vibrate?.(30);
    latest.current = { ...latest.current, logs: nextLogs };
    if (stepIndex >= steps.length - 1) return goFinish();
    void persist({ logs: nextLogs, stepIndex: stepIndex + 1 });
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
    void persist({ blockIndex: blockIndex + 1 });
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
      distanceKm: distance === "" ? null : Number(distance) * 1.609344,
      avgHr: avgHr === "" ? null : Number(avgHr),
      avgPower: avgPower === "" ? null : Number(avgPower),
    });
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // storage unavailable
    }
    router.push(`/workouts/${workout.id}`);
    router.refresh();
  }

  async function quit() {
    // Saved on this phone and on the server, so coming back resumes where you left off.
    await persist();
    router.push(`/workouts/${workout.id}`);
    router.refresh();
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
          {endurance && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <label className="text-sm text-zinc-400">
                  Distance (mi)
                  <input value={distance} onChange={(e) => setDistance(e.target.value)} type="number" inputMode="decimal" step="any" className={`${field} mt-1`} />
                </label>
                <label className="text-sm text-zinc-400">
                  Avg HR
                  <input value={avgHr} onChange={(e) => setAvgHr(e.target.value)} type="number" inputMode="numeric" className={`${field} mt-1`} />
                </label>
                <label className="text-sm text-zinc-400">
                  Avg watts
                  <input value={avgPower} onChange={(e) => setAvgPower(e.target.value)} type="number" inputMode="numeric" className={`${field} mt-1`} />
                </label>
              </div>
              {distance !== "" && Number(minutes) > 0 && Number(distance) > 0 && (
                <p className="text-sm text-zinc-500">
                  Pace {(() => {
                    const p = Number(minutes) / Number(distance);
                    return `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")} /mi`;
                  })()}
                </p>
              )}
            </>
          )}
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
          {lastTime[step.exercise] && <p className="mt-1 text-sm text-emerald-400/80">Last time: {lastTime[step.exercise]}</p>}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="text-sm text-zinc-400">
              {step.seconds ? "Seconds" : "Reps"}
              <input value={reps} onChange={(e) => setReps(e.target.value)} type="number" inputMode="numeric" className={`${field} mt-1 text-2xl`} />
            </label>
            <label className="text-sm text-zinc-400">
              Weight (lb)
              <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" inputMode="decimal" step="2.5" className={`${field} mt-1 text-2xl`} />
            </label>
            <div className="col-span-2">
              <p className="text-sm text-zinc-400">Effort (optional)</p>
              <div className="mt-1 grid grid-cols-6 gap-1">
                {["6", "7", "8", "9", "10"].map((n) => (
                  <button key={n} type="button" onClick={() => setSetRpeVal(setRpeVal === n ? "" : n)} className={`rounded-lg border py-2 text-sm ${setRpeVal === n ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-zinc-800 text-zinc-400"}`}>
                    RPE {n}
                  </button>
                ))}
              </div>
            </div>
            {plates && (
              <p className="col-span-2 text-sm text-zinc-500">
                Barbell (45 lb bar): {plates.length ? `${plates.join(" + ")} per side` : "bar only"}
              </p>
            )}
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
