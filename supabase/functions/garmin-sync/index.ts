// Pulls the signed-in user's Garmin data through Garmin's personal API and stores it in Postgres.
// Auth: the caller's Supabase access token (checked in code). The Garmin key is read with the
// service role and is never returned or logged.
import { createClient } from "npm:@supabase/supabase-js@2";

const HOST = "https://personal.connectapi.garmin.com";
const TOKEN_URL = `${HOST}/personalapitoken-service/personal-api/personal-api-key/token`;

// deno-lint-ignore no-explicit-any
type Json = any;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};

const pick = (o: Json, ...keys: string[]): Json => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return null;
};
const num = (v: Json): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const int = (v: Json): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
/** First array found in a response: the response itself, or the first array-valued property. */
const arr = (x: Json): Json[] => {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object") return (Object.values(x).find(Array.isArray) as Json[]) ?? [];
  return [];
};
const dayOf = (o: Json): string => String(pick(o, "calendarDate", "date", "summaryDate", "day") ?? "").slice(0, 10);

const gmt = (s: Json): string | null => {
  if (typeof s !== "string" || !s) return null;
  const t = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

async function exchangeToken(apiKey: string): Promise<string> {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: `ApiKey ${apiKey}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Garmin rejected the key (HTTP ${res.status}).`);
  try {
    const j = JSON.parse(text);
    const t = pick(j, "access_token", "accessToken", "token");
    if (typeof t === "string") return t;
  } catch {
    // not JSON; maybe a bare token
  }
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(text.trim())) return text.trim();
  throw new Error("Garmin returned a token response in a format Body IQ doesn't recognise.");
}

type EndpointResult = { name: string; status: number | "error"; keys?: string[]; itemKeys?: string[]; count?: number };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(bearer);
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: "Not signed in." }, 401);

  const body = await req.json().catch(() => ({}));
  const days = Math.min(30, Math.max(1, Math.round(Number(body?.days) || 7)));

  const { data: cred } = await admin.from("garmin_credentials").select("api_key").eq("user_id", userId).maybeSingle();
  if (!cred?.api_key) return json({ error: "No Garmin key saved. Add it on the Connect page." }, 400);

  const { data: run } = await admin.from("sync_runs").insert({ user_id: userId, source: "garmin", status: "running" }).select("id").single();
  const runId = run?.id as string | undefined;
  const finish = async (status: "success" | "error", items: number | null, error: string | null, detail: unknown) => {
    if (runId) await admin.from("sync_runs").update({ status, items, error, detail, finished_at: new Date().toISOString() }).eq("id", runId);
  };

  try {
    const token = await exchangeToken(cred.api_key);
    const end = isoDay(new Date());
    const start = addDays(end, -(days - 1));
    const results: EndpointResult[] = [];

    const get = async (name: string, path: string, params: Record<string, string | number> = {}): Promise<Json> => {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      try {
        const res = await fetch(`${HOST}${path}${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
        const text = await res.text();
        let data: Json = null;
        try {
          data = JSON.parse(text);
        } catch {
          // non-JSON body
        }
        const list = arr(data);
        results.push({
          name,
          status: res.status,
          keys: data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data).slice(0, 40) : undefined,
          itemKeys: list[0] && typeof list[0] === "object" ? Object.keys(list[0]).slice(0, 60) : undefined,
          count: list.length,
        });
        await new Promise((r) => setTimeout(r, 120));
        return res.ok ? data : null;
      } catch (e) {
        results.push({ name, status: "error" });
        console.error(name, e instanceof Error ? e.message : "request failed");
        return null;
      }
    };

    const [summaries, sleep, hrv, battery, stress] = [
      await get("dailysummaries", "/usersummary-service/v2/dailysummaries", { startDate: start, endDate: end }),
      await get("sleep", "/sleep-service/sleep/dailySleepSummariesByDate", { startDate: start, endDate: end }),
      await get("hrv", `/hrv-service/hrv/daily/${start}/${end}`),
      await get("bodybattery", "/wellness-service/wellness/bodyBattery/reports/daily", { startDate: start, endDate: end }),
      await get("stress", `/usersummary-service/stats/stress/daily/${start}/${end}`),
    ];
    const activitiesRaw = await get("activities", "/activitylist-service/activities/search/activities", {
      start: 0,
      limit: 100,
      startDate: start,
      endDate: end,
    });
    const nutrition: Record<string, Json> = {};
    for (let i = 0; i < Math.min(days, 14); i++) {
      const d = addDays(end, -i);
      const n = await get(i === 0 ? "nutrition" : `nutrition-${i}`, `/nutrition-service/food/logs/${d}`);
      if (n) nutrition[d] = n;
    }
    // Keep the detail list short: one nutrition line is enough to see the shape.
    const detail = { range: { start, end }, endpoints: results.filter((r) => !/^nutrition-\d+$/.test(r.name)) };

    // ---- normalise into one row per day ------------------------------------------------------
    type Day = {
      sleep_seconds: number | null;
      sleep_score: number | null;
      hrv_ms: number | null;
      resting_hr: number | null;
      body_battery_max: number | null;
      body_battery_min: number | null;
      stress_avg: number | null;
      steps: number | null;
      raw: Record<string, Json>;
    };
    const byDay = new Map<string, Day>();
    const dayRow = (d: string): Day => {
      let r = byDay.get(d);
      if (!r) {
        r = { sleep_seconds: null, sleep_score: null, hrv_ms: null, resting_hr: null, body_battery_max: null, body_battery_min: null, stress_avg: null, steps: null, raw: {} };
        byDay.set(d, r);
      }
      return r;
    };

    for (const s of arr(summaries)) {
      const d = dayOf(s);
      if (!d) continue;
      const r = dayRow(d);
      // The personal API nests these: movement.steps.value, heartRate.restingValue, stress.avgLevel, bodyBattery.maxValue.
      r.steps = int(s?.movement?.steps?.value ?? pick(s, "totalSteps", "steps"));
      r.resting_hr = int(s?.heartRate?.restingValue ?? pick(s, "restingHeartRate", "restingHeartRateValue"));
      r.stress_avg = int(s?.stress?.avgLevel ?? pick(s, "averageStressLevel", "avgStressLevel"));
      r.body_battery_max = int(s?.bodyBattery?.maxValue ?? pick(s, "bodyBatteryHighestValue", "bodyBatteryMostRecentValue"));
      r.body_battery_min = int(s?.bodyBattery?.minValue ?? pick(s, "bodyBatteryLowestValue"));
      r.raw.summary = s;
    }
    for (const s of arr(sleep)) {
      const d = dayOf(s) || dayOf(s?.dailySleepDTO);
      if (!d) continue;
      const r = dayRow(d);
      const dto = s?.dailySleepDTO ?? s;
      r.sleep_seconds = int(pick(dto, "sleepTimeSeconds", "totalSleepSeconds"));
      r.sleep_score = int(dto?.sleepScores?.overall?.value ?? pick(dto, "sleepScore", "overallScore"));
      r.raw.sleep = s;
    }
    for (const h of arr(hrv)) {
      const d = dayOf(h);
      if (!d) continue;
      const r = dayRow(d);
      r.hrv_ms = num(pick(h, "lastNightAvg", "lastNight", "avgOvernightHrv") ?? h?.hrvSummary?.lastNightAvg);
      r.raw.hrv = h;
    }
    for (const b of arr(battery)) {
      const d = dayOf(b);
      if (!d) continue;
      const r = dayRow(d);
      const vals = (Array.isArray(b?.bodyBatteryValuesArray) ? b.bodyBatteryValuesArray : [])
        .map((p: Json) => (Array.isArray(p) ? num(p[1]) : null))
        .filter((v: number | null): v is number => v !== null);
      if (vals.length) {
        r.body_battery_max = Math.max(...vals);
        r.body_battery_min = Math.min(...vals);
      }
      r.raw.bodyBattery = b;
    }
    for (const s of arr(stress)) {
      const d = dayOf(s);
      if (!d) continue;
      const r = dayRow(d);
      r.stress_avg = r.stress_avg ?? int(s?.values?.overallStressLevel ?? pick(s, "overallStressLevel", "avgStressLevel"));
      r.raw.stress = s;
    }
    for (const [d, n] of Object.entries(nutrition)) dayRow(d).raw.nutrition = n;

    const healthRows = [...byDay.entries()].map(([day, r]) => ({
      user_id: userId,
      day,
      sleep_seconds: r.sleep_seconds,
      sleep_score: r.sleep_score,
      hrv_ms: r.hrv_ms,
      resting_hr: r.resting_hr,
      body_battery_max: r.body_battery_max,
      body_battery_min: r.body_battery_min,
      stress_avg: r.stress_avg,
      steps: r.steps,
      raw_json: r.raw,
      updated_at: new Date().toISOString(),
    }));
    if (healthRows.length) {
      const { error } = await admin.from("daily_health").upsert(healthRows, { onConflict: "user_id,day" });
      if (error) throw new Error(`Saving daily health failed: ${error.message}`);
    }

    const activityRows = arr(activitiesRaw)
      .map((a) => {
        const id = pick(a, "activityId", "id");
        const started = gmt(pick(a, "startTimeGMT", "startTimeLocal", "startTime"));
        if (id === null || !started) return null;
        return {
          user_id: userId,
          garmin_id: String(id),
          sport: String(a?.activityType?.typeKey ?? pick(a, "activityType", "sport") ?? "") || null,
          title: pick(a, "activityName", "name"),
          started_at: started,
          duration_sec: int(pick(a, "duration", "elapsedDuration")),
          distance_m: num(pick(a, "distance")),
          avg_hr: int(pick(a, "averageHR", "avgHr", "averageHeartRate")),
          max_hr: int(pick(a, "maxHR", "maxHr", "maxHeartRate")),
          avg_power: int(pick(a, "avgPower", "averagePower")),
          training_load: num(pick(a, "activityTrainingLoad", "trainingLoad")),
          raw_json: a,
        };
      })
      .filter((x) => x !== null);
    if (activityRows.length) {
      const { error } = await admin.from("activities").upsert(activityRows, { onConflict: "user_id,garmin_id" });
      if (error) throw new Error(`Saving activities failed: ${error.message}`);
    }

    const failed = results.filter((r) => r.status !== 200 && !/^nutrition-\d+$/.test(r.name)).map((r) => `${r.name} (${r.status})`);
    const items = healthRows.length + activityRows.length;
    await finish("success", items, failed.length ? `Some data unavailable: ${failed.join(", ")}` : null, detail);
    return json({ ok: true, days: healthRows.length, activities: activityRows.length, failed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await finish("error", null, message, null);
    return json({ ok: false, error: message }, 502);
  }
});
