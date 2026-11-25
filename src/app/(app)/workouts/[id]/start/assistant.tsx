"use client";

import { useToast } from "@/components/toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BlockLog, SetLog, Workout } from "@/lib/types";
import { btnGhost, btnPrimary, field } from "@/components/ui";
import { buildSteps } from "@/lib/steps";
import { elapsedMs as elapsedAt, pickResume } from "@/lib/progress";
import { isDumbbell } from "@/lib/context";
import { applyOrder, moveExercise, queueOverview, stepKey } from "@/lib/queue";
import { fmtPace, fromKm, paceProblem, toKm, type DistUnit } from "@/lib/distance";
import { fmtTime } from "@/lib/hyrox";
import { countSets, recap, totalVolume, volumeByExercise, skipExerciseLogs, skippedLog } from "@/lib/player";
import { finishWorkout, saveProgress } from "../../actions";

type Resume = { logs: SetLog[]; blocks: BlockLog[]; stepIndex: number; blockIndex: number; elapsedMs: number; order?: string[] };

const AUTO_KEY = "bodyiq-auto-advance-rest";
const GO_MS = 3000;

/** Short beep via WebAudio (free, no assets). Silent if the browser blocks audio. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    // audio unavailable
  }
}

const fmt = (totalSec: number) => {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Assistant({ workout, lastWeights, lastTime, serverResume, targets = {}, targetRace = null, lastVolume = {}, lastEndurance = null, plannedDistanceKm = null, distanceUnit = "mi" }: { workout: Workout; lastWeights: Record<string, number>; lastTime: Record<string, string>; serverResume: Resume | null; targets?: Record<string, number>; targetRace?: string | null; lastVolume?: Record<string, number>; lastEndurance?: { date: string; km: number | null; minutes: number | null } | null; plannedDistanceKm?: number | null; distanceUnit?: DistUnit }) {
  const router = useRouter();
  const { toast } = useToast();
  const warned = useRef(false);
  const baseSteps = useMemo(() => buildSteps(workout), [workout]);
  const blocks = workout.structure?.blocks ?? [];
  const mode: "sets" | "blocks" | "timer" = baseSteps.length ? "sets" : blocks.length ? "blocks" : "timer";

  const draftKey = `bodyiq-draft-${workout.id}`;
  const [now, setNow] = useState(() => Date.now());
  // Resume from the server copy or this phone's draft, whichever has more progress.
  const [saved] = useState<Resume | null>(() => {
    let local: Resume | null = null;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (d && Array.isArray(d.logs)) {
        local = { logs: d.logs, blocks: Array.isArray(d.blocks) ? d.blocks : [], stepIndex: Number(d.stepIndex) || 0, blockIndex: Number(d.blockIndex) || 0, elapsedMs: typeof d.elapsedMs === "number" ? d.elapsedMs : 0, order: Array.isArray(d.order) ? d.order.filter((k: unknown) => typeof k === "string") : undefined };
      }
    } catch {
      // storage unavailable
    }
    return pickResume(serverResume, local);
  });
  // Elapsed time only counts while this screen is open: saved time plus this visit.
  const [baseMs, setBaseMs] = useState(saved?.elapsedMs ?? 0);
  const [segmentStart, setSegmentStart] = useState<number | null>(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const paused = pausedAt !== null;
  const effNow = pausedAt ?? now;
  const [stepIndex, setStepIndex] = useState(() => Math.min(saved?.stepIndex ?? 0, Math.max(0, baseSteps.length - 1)));
  // Order the remaining sets will be done in (null = as planned). Sets already logged never move.
  const [order, setOrder] = useState<string[] | null>(() => saved?.order ?? null);
  const steps = useMemo(() => applyOrder(baseSteps, order), [baseSteps, order]);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  // Setting kept on this device (a Settings page can move it to the account later). Default ON.
  const [autoAdvance, setAutoAdvanceState] = useState(() => {
    try {
      return localStorage.getItem(AUTO_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const setAutoAdvance = (v: boolean) => {
    setAutoAdvanceState(v);
    try {
      localStorage.setItem(AUTO_KEY, v ? "on" : "off");
    } catch {
      // storage unavailable
    }
  };
  const [blockIndex, setBlockIndex] = useState(() => Math.min(saved?.blockIndex ?? 0, Math.max(0, blocks.length - 1)));
  const [blockStart, setBlockStart] = useState(() => Date.now());
  const [logs, setLogs] = useState<SetLog[]>(() => saved?.logs ?? []);
  const [blockLogs, setBlockLogs] = useState<BlockLog[]>(() => saved?.blocks ?? []);
  const [editing, setEditing] = useState(false);
  const [eReps, setEReps] = useState("");
  const [eWeight, setEWeight] = useState("");
  const [eRpe, setERpe] = useState("");
  const [finished, setFinished] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const prefill = (i: number, done: SetLog[], list: typeof steps = steps) => {
    const st = list[i];
    if (!st) return { reps: "", weight: "" };
    const prev = [...done].reverse().find((l) => l.exercise === st.exercise && l.weight_lb !== null)?.weight_lb;
    const w = prev ?? lastWeights[st.exercise] ?? st.weight;
    return { reps: String(st.seconds ?? st.reps ?? ""), weight: w !== undefined && w !== null ? String(w) : "" };
  };
  const [reps, setReps] = useState(() => prefill(stepIndex, saved?.logs ?? []).reps);
  const [weight, setWeight] = useState(() => prefill(stepIndex, saved?.logs ?? []).weight);
  // Summary fields (notes, RPE, minutes, HR, power) are kept on this phone too, so a refresh doesn't lose what you typed.
  const sumKey = `${draftKey}-summary`;
  const [sum0] = useState<Partial<Record<"notes" | "rpe" | "minutes" | "avgHr" | "avgPower" | "fuelCarbs" | "fluidMl" | "sodiumMg", string>>>(() => {
    try {
      return JSON.parse(localStorage.getItem(sumKey) ?? "{}") ?? {};
    } catch {
      return {};
    }
  });
  const [rpe, setRpe] = useState(sum0.rpe ?? "");
  const [setRpeVal, setSetRpeVal] = useState("");
  const [unit, setUnit] = useState<DistUnit>(distanceUnit);
  const [distance, setDistance] = useState(() => (plannedDistanceKm ? String(fromKm(plannedDistanceKm, distanceUnit)) : ""));
  const [avgHr, setAvgHr] = useState(sum0.avgHr ?? "");
  const [avgPower, setAvgPower] = useState(sum0.avgPower ?? "");
  const endurance = ["run", "bike", "swim", "hyrox"].includes(workout.sport);
  const [notes, setNotes] = useState(sum0.notes ?? "");
  const [fuelCarbs, setFuelCarbs] = useState(sum0.fuelCarbs ?? "");
  const [fluidMl, setFluidMl] = useState(sum0.fluidMl ?? "");
  const [sodiumMg, setSodiumMg] = useState(sum0.sodiumMg ?? "");
  const [minutes, setMinutes] = useState(sum0.minutes ?? "");
  useEffect(() => {
    try {
      if (notes || rpe || minutes || avgHr || avgPower || fuelCarbs || fluidMl || sodiumMg) localStorage.setItem(sumKey, JSON.stringify({ notes, rpe, minutes, avgHr, avgPower, fuelCarbs, fluidMl, sodiumMg }));
    } catch {
      // storage unavailable
    }
  }, [sumKey, notes, rpe, minutes, avgHr, avgPower, fuelCarbs, fluidMl, sodiumMg]);
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
  const latest = useRef({ logs, blocks: blockLogs, stepIndex, blockIndex, elapsed: elapsedNow, order });
  useEffect(() => {
    latest.current = { logs, blocks: blockLogs, stepIndex, blockIndex, elapsed: elapsedNow, order };
  });

  // Never lose a session: keep progress on the phone until it is saved (heartbeat every 5 s).
  const beat = Math.floor(now / 5000);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ logs, blocks: blockLogs, stepIndex, blockIndex, elapsedMs: latest.current.elapsed, order }));
    } catch {
      // storage unavailable
    }
  }, [draftKey, logs, blockLogs, stepIndex, blockIndex, order, beat]);

  // Also keep it on the server so the session shows as in progress everywhere.
  const persist = useCallback(
    (over?: Partial<{ logs: SetLog[]; blocks: BlockLog[]; stepIndex: number; blockIndex: number; order: string[] | null }>) => {
      const l = latest.current;
      return saveProgress({ id: workout.id, sets: over?.logs ?? l.logs, blocks: over?.blocks ?? l.blocks, stepIndex: over?.stepIndex ?? l.stepIndex, blockIndex: over?.blockIndex ?? l.blockIndex, elapsedMs: l.elapsed, order: (over?.order !== undefined ? over.order : l.order) ?? undefined })
        .catch(() => ({ error: "offline" }))
        .then((res) => {
          // Tell the user once per outage; the draft stays on this phone and the next save retries.
          if (res.error && !warned.current) {
            warned.current = true;
            toast("Couldn't save to the server. Your progress is kept on this phone and will retry.", "error");
          } else if (!res.error) warned.current = false;
          return res;
        });
    },
    [workout.id, toast],
  );
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void persist();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persist]);

  const elapsedSec = elapsedNow / 1000;
  const restLeft = restEnd ? Math.max(0, Math.ceil((restEnd - effNow) / 1000)) : 0;
  const resting = restEnd !== null;

  const overtimeSec = restEnd ? Math.max(0, Math.floor((effNow - restEnd) / 1000)) : 0;

  // At 0:00: beep + vibrate once, then (if auto-advance is on) show GO for 3 s and move on.
  useEffect(() => {
    if (resting && !paused && restLeft === 0 && !buzzed.current) {
      buzzed.current = true;
      navigator.vibrate?.([200, 100, 200]);
      beep();
    }
  }, [resting, paused, restLeft]);
  useEffect(() => {
    if (!autoAdvance || !resting || paused || restLeft !== 0) return;
    const t = setTimeout(() => setRestEnd(null), GO_MS);
    return () => clearTimeout(t);
  }, [autoAdvance, resting, paused, restLeft]);

  const goFinish = useCallback(() => {
    setMinutes(String(Math.max(1, Math.round(latest.current.elapsed / 60000))));
    setFinished(true);
  }, []);

  function advanceTo(nextLogs: SetLog[], nextIndex: number, rest: number) {
    setLogs(nextLogs);
    setSetRpeVal("");
    setEditing(false);
    latest.current = { ...latest.current, logs: nextLogs };
    if (nextIndex >= steps.length) return goFinish();
    void persist({ logs: nextLogs, stepIndex: nextIndex });
    if (rest > 0) {
      buzzed.current = false;
      setRestEnd(Date.now() + rest * 1000);
    } else setRestEnd(null);
    const next = prefill(nextIndex, nextLogs);
    setReps(next.reps);
    setWeight(next.weight);
    setStepIndex(nextIndex);
  }

  function completeSet() {
    if (!step) return;
    const r = reps.trim() === "" ? null : Number(reps);
    const w = weight.trim() === "" ? null : Number(weight);
    navigator.vibrate?.(30);
    advanceTo(
      [...logs, { exercise: step.exercise, set_number: step.setNumber, reps: Number.isFinite(r) ? r : null, weight_lb: Number.isFinite(w) ? w : null, rpe: setRpeVal === "" ? null : Number(setRpeVal) }],
      stepIndex + 1,
      step.restAfter,
    );
  }

  /** Records the set as skipped (kept in history) and moves on without resting. */
  function skipSet() {
    if (!step) return;
    advanceTo([...logs, skippedLog(step)], stepIndex + 1, 0);
  }

  function skipExercise() {
    if (!step) return;
    const skipped = skipExerciseLogs(steps, stepIndex);
    advanceTo([...logs, ...skipped], stepIndex + skipped.length, 0);
  }

  /** Moves one exercise to the front ("next") or back ("later") of what is left, e.g. when its machine is taken. */
  function reorder(exercise: string, where: "next" | "later") {
    const next = moveExercise(steps, stepIndex, exercise, where);
    if (next === steps) return;
    const keys = next.map(stepKey);
    setOrder(keys);
    latest.current = { ...latest.current, order: keys };
    setShowOverview(false);
    if (stepKey(next[stepIndex]) !== stepKey(steps[stepIndex])) {
      const fresh = prefill(stepIndex, logs, next);
      setReps(fresh.reps);
      setWeight(fresh.weight);
      setSetRpeVal("");
      setRestEnd(null);
    }
    void persist({ order: keys });
  }

  /** Back one set, with its values restored so they can be edited and saved again. */
  function goBack() {
    if (mode === "sets") {
      if (stepIndex === 0) return;
      const aligned = logs.length >= stepIndex;
      const prev = aligned ? logs[stepIndex - 1] : undefined;
      const nextLogs = aligned ? logs.slice(0, stepIndex - 1) : logs;
      const target = stepIndex - 1;
      setLogs(nextLogs);
      latest.current = { ...latest.current, logs: nextLogs };
      setRestEnd(null);
      setEditing(false);
      const fresh = prefill(target, nextLogs);
      setReps(prev && !prev.skipped && prev.reps !== null ? String(prev.reps) : fresh.reps);
      setWeight(prev && !prev.skipped && prev.weight_lb !== null ? String(prev.weight_lb) : fresh.weight);
      setSetRpeVal(prev?.rpe ? String(prev.rpe) : "");
      setStepIndex(target);
      void persist({ logs: nextLogs, stepIndex: target });
    } else if (mode === "blocks") {
      if (blockIndex === 0) return;
      const nextBlocks = blockLogs.slice(0, blockIndex - 1);
      setBlockLogs(nextBlocks);
      latest.current = { ...latest.current, blocks: nextBlocks };
      setBlockIndex(blockIndex - 1);
      setBlockStart(Date.now());
      void persist({ blocks: nextBlocks, blockIndex: blockIndex - 1 });
    }
  }

  function startEdit() {
    const last = logs[logs.length - 1];
    if (!last || last.skipped) return;
    setEReps(last.reps !== null ? String(last.reps) : "");
    setEWeight(last.weight_lb !== null ? String(last.weight_lb) : "");
    setERpe(last.rpe ? String(last.rpe) : "");
    setEditing(true);
  }

  function saveEdit() {
    const r = eReps.trim() === "" ? null : Number(eReps);
    const w = eWeight.trim() === "" ? null : Number(eWeight);
    const nextLogs = logs.map((l, i) =>
      i === logs.length - 1 ? { ...l, reps: r !== null && Number.isFinite(r) ? r : null, weight_lb: w !== null && Number.isFinite(w) ? w : null, rpe: eRpe === "" ? null : Number(eRpe) } : l,
    );
    setLogs(nextLogs);
    latest.current = { ...latest.current, logs: nextLogs };
    setEditing(false);
    void persist({ logs: nextLogs });
  }

  function finishBlock(skip: boolean) {
    const b = blocks[blockIndex];
    const entry: BlockLog = { name: b.name, seconds: skip ? null : Math.round((effNow - blockStart) / 1000), skipped: skip };
    const nextBlocks = [...blockLogs, entry];
    setBlockLogs(nextBlocks);
    latest.current = { ...latest.current, blocks: nextBlocks };
    navigator.vibrate?.(30);
    if (blockIndex >= blocks.length - 1) return goFinish();
    void persist({ blocks: nextBlocks, blockIndex: blockIndex + 1 });
    setBlockIndex((i) => i + 1);
    setBlockStart(Date.now());
  }

  function pause() {
    if (paused) return;
    const t = Date.now();
    setBaseMs(elapsedAt(baseMs, segmentStart, t));
    setSegmentStart(null);
    setPausedAt(t);
  }

  function resume() {
    if (pausedAt === null) return;
    const t = Date.now();
    const gap = t - pausedAt;
    setSegmentStart(t);
    if (restEnd !== null) setRestEnd(restEnd + gap);
    setBlockStart((b) => b + gap);
    setPausedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const m = Number(minutes);
    const km = distance === "" ? null : toKm(Number(distance), unit);
    if (workout.sport === "run") {
      const problem = paceProblem(Number.isFinite(m) && minutes !== "" ? m : null, km);
      if (problem) {
        setError(problem);
        setSaving(false);
        return;
      }
    }
    const res = await finishWorkout({
      id: workout.id,
      sets: logs,
      actualMinutes: Number.isFinite(m) && minutes !== "" ? m : null,
      rpe: rpe === "" ? null : Number(rpe),
      notes,
      distanceKm: km,
      distanceUnit: unit,
      avgHr: avgHr === "" ? null : Number(avgHr),
      avgPower: avgPower === "" ? null : Number(avgPower),
      fuelCarbsG: fuelCarbs === "" ? null : Number(fuelCarbs),
      fluidMl: fluidMl === "" ? null : Number(fluidMl),
      sodiumMg: sodiumMg === "" ? null : Number(sodiumMg),
      blocks: blockLogs,
    });
    if (res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    if (res.message) toast(res.message);
    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(sumKey);
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
          {workout.title} &middot;{" "}
          {mode === "sets" && (!endurance || countSets(logs).done > 0)
            ? `${countSets(logs).done} set${countSets(logs).done === 1 ? "" : "s"} logged${countSets(logs).skipped ? `, ${countSets(logs).skipped} skipped` : ""}`
            : mode === "blocks"
              ? `${blockLogs.filter((b) => !b.skipped).length} of ${blocks.length} blocks done${blockLogs.some((b) => b.skipped) ? `, ${blockLogs.filter((b) => b.skipped).length} skipped` : ""}`
              : `${fmt(elapsedSec)} elapsed`}
        </p>
        {mode === "sets" && totalVolume(logs) > 0 && (
          <p className="mt-1 text-sm text-zinc-400">Total volume {Math.round(totalVolume(logs)).toLocaleString("en-US")} lb</p>
        )}
        {mode === "sets" && logs.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {recap(logs).map((r) => (
              <li key={r.exercise} className="rounded-xl border border-zinc-800 px-3 py-2">
                <p className="font-medium">{r.exercise}</p>
                <p className="text-zinc-400">
                  {r.lines.map((l, i) => (
                    <span key={i} className={l === "skipped" ? "text-amber-400" : ""}>
                      {i > 0 ? " · " : ""}
                      {l}
                    </span>
                  ))}
                </p>
                {(() => {
                  const vol = volumeByExercise(logs)[r.exercise];
                  const prev = lastVolume[r.exercise];
                  if (!vol) return null;
                  const d = prev ? Math.round(vol - prev) : null;
                  return (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Volume {Math.round(vol).toLocaleString("en-US")} lb
                      {d !== null ? ` · ${d >= 0 ? "+" : ""}${d.toLocaleString("en-US")} lb vs last time` : ""}
                    </p>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
        {mode === "blocks" && blockLogs.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {blockLogs.map((b, i) => (
              <li key={i} className="flex justify-between rounded-xl border border-zinc-800 px-3 py-2">
                <span>{b.name}</span>
                <span className={b.skipped ? "text-amber-400" : "tabular-nums text-zinc-400"}>
                  {b.skipped ? "skipped" : fmt(b.seconds ?? 0)}
                  {!b.skipped && targets[b.name] ? ` (target ${fmtTime(targets[b.name])})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 space-y-3">
          <label className="block text-sm text-zinc-400">
            Duration (min)
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" inputMode="numeric" className={`${field} mt-1`} />
          </label>
          {endurance && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <label className="text-sm text-zinc-400">
                  Distance
                  <div className="mt-1 flex gap-1">
                    <input value={distance} onChange={(e) => setDistance(e.target.value)} type="number" inputMode="decimal" step="any" className={`${field} min-w-0`} aria-label="Distance" />
                    <select value={unit} onChange={(e) => setUnit(e.target.value as DistUnit)} className={`${field} w-16 px-1`} aria-label="Distance unit">
                      <option value="mi">mi</option>
                      <option value="km">km</option>
                    </select>
                  </div>
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
                  Pace {fmtPace(Number(minutes), toKm(Number(distance), unit), unit)}
                  {lastEndurance?.km && lastEndurance.minutes
                    ? ` · last time ${fmtPace(lastEndurance.minutes, lastEndurance.km, unit)} over ${fromKm(lastEndurance.km, unit)} ${unit}`
                    : ""}
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
          <details className="rounded-xl border border-zinc-800 p-3" open={fuelCarbs !== "" || fluidMl !== "" || sodiumMg !== ""}>
            <summary className="cursor-pointer text-sm text-zinc-300">Fuel and fluids during the session (optional)</summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <label className="text-sm text-zinc-400">
                Carbs (g)
                <input value={fuelCarbs} onChange={(e) => setFuelCarbs(e.target.value)} type="number" inputMode="decimal" min="0" className={`${field} mt-1`} />
              </label>
              <label className="text-sm text-zinc-400">
                Fluid (ml)
                <input value={fluidMl} onChange={(e) => setFluidMl(e.target.value)} type="number" inputMode="numeric" min="0" className={`${field} mt-1`} />
              </label>
              <label className="text-sm text-zinc-400">
                Sodium (mg)
                <input value={sodiumMg} onChange={(e) => setSodiumMg(e.target.value)} type="number" inputMode="numeric" min="0" className={`${field} mt-1`} />
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-500">For sessions of 75 minutes or more, the finished workout compares this with the per-hour ranges.</p>
          </details>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes" aria-label="Session notes" className={field} />
          {error && <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button onClick={save} disabled={saving} className={`${btnPrimary} w-full`}>
            {saving ? "Saving..." : "Save workout"}
          </button>
        </div>
      </main>
    );
  }

  // ----------------------------------------------------------------- paused
  if (paused) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <header className="flex items-center justify-between">
          <button onClick={quit} className="text-sm text-zinc-400 active:text-zinc-200">
            Quit
          </button>
          <p className="truncate text-sm text-zinc-400">{workout.title}</p>
          <span className="w-12" />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-widest text-amber-400">Paused</p>
          <p className="mt-2 text-7xl font-semibold tabular-nums text-zinc-300">{fmt(elapsedSec)}</p>
          <p className="mt-4 text-sm text-zinc-500">The workout and rest timers are stopped.</p>
        </div>
        <button onClick={resume} className={`${btnPrimary} py-4 text-lg`}>
          Resume
        </button>
      </main>
    );
  }

  // ------------------------------------------------------------------- rest
  if (mode === "sets" && resting && step) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <Header title={workout.title} elapsed={elapsedSec} onQuit={quit} onPause={pause} />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-widest text-zinc-500">{restLeft === 0 ? (autoAdvance ? "Go" : "Rest over") : "Rest"}</p>
          <p className={`mt-2 text-8xl font-semibold tabular-nums ${restLeft === 0 ? "text-emerald-400" : ""}`}>
            {restLeft === 0 && !autoAdvance ? `+${fmt(overtimeSec)}` : fmt(restLeft)}
          </p>
          <p className="mt-6 text-zinc-400">
            Next: {step.exercise}, set {step.setNumber} of {step.totalSets}
          </p>
          <label className="mt-6 flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
            Auto-advance after rest
          </label>
        </div>
        {logs.length > 0 && !logs[logs.length - 1].skipped && (
          <div className="mb-3 rounded-xl border border-zinc-800 px-3 py-2 text-sm">
            {editing ? (
              <div className="space-y-2">
                <p className="text-zinc-400">Edit {logs[logs.length - 1].exercise}, set {logs[logs.length - 1].set_number}</p>
                <div className="grid grid-cols-3 gap-2">
                  <input value={eReps} onChange={(e) => setEReps(e.target.value)} type="number" inputMode="numeric" placeholder="Reps" className={field} aria-label="Reps" />
                  <input value={eWeight} onChange={(e) => setEWeight(e.target.value)} type="number" inputMode="decimal" step="any" placeholder="lb" className={field} aria-label="Weight" />
                  <select value={eRpe} onChange={(e) => setERpe(e.target.value)} className={field} aria-label="RPE">
                    <option value="">RPE</option>
                    {[6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setEditing(false)} className={btnGhost}>
                    Cancel
                  </button>
                  <button onClick={saveEdit} className={btnPrimary}>
                    Save set
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">
                  Last set: {logs[logs.length - 1].weight_lb !== null ? `${logs[logs.length - 1].weight_lb} × ` : ""}
                  {logs[logs.length - 1].reps ?? "-"}
                  {logs[logs.length - 1].rpe ? ` @${logs[logs.length - 1].rpe}` : ""}
                </span>
                <button onClick={startEdit} className="text-emerald-400">
                  Edit
                </button>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={goBack} className={btnGhost}>
            ‹ Back
          </button>
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
    const queue = queueOverview(steps, logs, stepIndex);
    const position = queue.filter((q) => q.finished).length + 1;
    const stillToDo = queue.filter((q) => !q.finished).length;
    const metres = step.unit === "m";
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <Header title={workout.title} elapsed={elapsedSec} onQuit={quit} onPause={pause} />
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-emerald-500" style={{ width: `${(stepIndex / steps.length) * 100}%` }} />
        </div>
        <div className="flex-1 pt-8">
          <button type="button" onClick={() => setShowOverview((v) => !v)} aria-expanded={showOverview} className="text-left text-sm text-emerald-400">
            Exercise {position} of {queue.length} · {step.exercise} {showOverview ? "▴" : "▾"}
          </button>
          {showOverview && (
            <ul className="mt-2 divide-y divide-zinc-800 rounded-xl border border-zinc-800 text-sm">
              {queue.map((o) => (
                <li key={o.name} className={`flex items-center justify-between gap-2 px-3 py-2 ${o.current ? "text-emerald-300" : o.finished ? "text-zinc-600" : "text-zinc-300"}`}>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="tabular-nums">
                    {o.done}/{o.total} sets
                    {o.skipped ? ` · ${o.skipped} skipped` : ""}
                  </span>
                  {!o.finished && !o.current && (
                    <button type="button" onClick={() => reorder(o.name, "next")} aria-label={`Do ${o.name} next`} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-emerald-400">
                      Do now
                    </button>
                  )}
                  {!o.finished && o.current && stillToDo > 1 && (
                    <button type="button" onClick={() => reorder(o.name, "later")} aria-label={`Do ${o.name} later`} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                      Later
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-zinc-500">
            Set {step.setNumber} of {step.totalSets}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{step.exercise}</h1>
          <p className="mt-2 text-zinc-400">
            Target: {step.seconds ? `${step.seconds} s` : metres ? `${step.reps ?? "-"} m` : `${step.reps ?? "-"} reps`}
            {step.weight ? ` @ ${step.weight} lb${isDumbbell(step.exercise) ? " each" : ""}` : ""}
          </p>
          {step.note && <p className="mt-1 text-sm text-zinc-500">{step.note}</p>}
          {lastTime[step.exercise] && <p className="mt-1 text-sm text-emerald-400/80">Last time: {lastTime[step.exercise]}</p>}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="text-sm text-zinc-400">
              {step.seconds ? "Seconds" : metres ? "Metres" : "Reps"}
              <input value={reps} onChange={(e) => setReps(e.target.value)} type="number" inputMode="numeric" className={`${field} mt-1 text-2xl`} />
            </label>
            <label className="text-sm text-zinc-400">
              {isDumbbell(step.exercise) ? "Weight per dumbbell (lb)" : "Weight (lb)"}
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
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={goBack} disabled={stepIndex === 0} className={btnGhost}>
            ‹ Back
          </button>
          <button onClick={() => reorder(step.exercise, "later")} disabled={stillToDo < 2} className={btnGhost}>
            Do later
          </button>
          <button onClick={skipSet} className={btnGhost}>
            Skip set
          </button>
          <button onClick={skipExercise} className={btnGhost}>
            Skip exercise
          </button>
        </div>
      </main>
    );
  }

  // ----------------------------------------------------------------- blocks
  if (mode === "blocks") {
    const b = blocks[blockIndex];
    const blockSec = (effNow - blockStart) / 1000;
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        <Header title={workout.title} elapsed={elapsedSec} onQuit={quit} onPause={pause} />
        <p className="mt-2 text-sm text-zinc-500">
          Block {blockIndex + 1} of {blocks.length}
        </p>
        <div className="flex-1 pt-4">
          <h1 className="text-3xl font-semibold tracking-tight">{b.name}</h1>
          {b.minutes ? <p className="mt-1 text-zinc-500">Target {b.minutes} min</p> : null}
          {targets[b.name] ? (
            <p className="mt-1 text-emerald-400/90">
              Target {fmtTime(targets[b.name])}
              {/^run/i.test(b.name) ? " /km" : ""}
              {targetRace ? <span className="text-zinc-500"> · from {targetRace} goal</span> : null}
            </p>
          ) : null}
          <p className="mt-3 text-lg text-zinc-300">{b.detail}</p>
          <p
            className={`mt-8 text-center text-7xl font-semibold tabular-nums ${b.minutes && blockSec > b.minutes * 60 ? "text-amber-400" : ""}`}
          >
            {fmt(blockSec)}
          </p>
        </div>
        {blocks[blockIndex + 1] && <p className="mb-3 text-center text-sm text-zinc-500">Next: {blocks[blockIndex + 1].name}</p>}
        <button onClick={() => finishBlock(false)} className={`${btnPrimary} py-4 text-lg`}>
          {blockIndex >= blocks.length - 1 ? "Finish" : "Next block"}
        </button>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={goBack} disabled={blockIndex === 0} className={btnGhost}>
            ‹ Back
          </button>
          <button onClick={() => finishBlock(true)} className={btnGhost}>
            Skip block
          </button>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------ timer
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <Header title={workout.title} elapsed={null} onQuit={quit} onPause={pause} />
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

function Header({ title, elapsed, onQuit, onPause }: { title: string; elapsed: number | null; onQuit: () => void; onPause: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <button onClick={onQuit} className="text-sm text-zinc-400 active:text-zinc-200">
        Quit
      </button>
      <p className="min-w-0 flex-1 truncate text-center text-sm text-zinc-400">{title}</p>
      <div className="flex items-center gap-3">
        <button onClick={onPause} className="rounded-lg border border-zinc-700 px-2.5 py-1 text-sm text-zinc-200 active:bg-zinc-800">
          Pause
        </button>
        <p className="w-11 text-right text-sm tabular-nums text-zinc-400">{elapsed === null ? "" : fmt(elapsed)}</p>
      </div>
    </header>
  );
}
