# Phase 0 spike: Garmin personal API and MFP nutrition

Goal (from the project scope, v2.0): get one activity and one daily summary into Supabase, find out whether MyFitnessPal nutrition arrives through Garmin, and confirm backfill depth and rate limits.

The database side is ready: `activities`, `daily_health` and `sync_runs` exist with RLS (signed-in users can read; only the service role writes). The sync code is not written yet because Garmin's data endpoints are only in its Swagger docs, which need your login.

## What Garmin publishes (checked Nov 25, 2026)
- Create a key at Garmin Connect web: Settings, Personal API Token (`connect.garmin.com/app/settings/personalApiToken`). The key is shown once. Pick an expiry of 30, 90, 180 or 365 days; Garmin emails a week before it expires.
- Exchange it for an access token: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token` with header `Authorization: ApiKey <your key>`.
- Access tokens last 24 hours, and there are no refresh tokens: request a new token each sync.
- Personal use only, your own data only.
- Not published on the pages I could read: data endpoint paths, field names, rate limits, backfill depth, nutrition. Those are in the Personal API Swagger docs linked from the Garmin developer site.

Sources: [Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-api), [Personal API FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq/).

## Steps for you
1. Create the key (the in-app guide at /connect walks through it; pick the 365-day expiry). Do not paste it into chat or commit it.
2. Store it as a Supabase secret: Dashboard, Edge Functions, Secrets, name `GARMIN_API_KEY`.
3. Open the Swagger docs from the Garmin developer site and note the paths for: activities, daily summaries, sleep, HRV, Body Battery, stress, resting HR, any nutrition scope, backfill range, rate limits.
4. In MyFitnessPal, check that Garmin is connected under Apps and Devices, then look at Garmin Connect for daily calories consumed.
5. Send me the Swagger endpoint list (paths and field names only, never the key). I'll write the `garmin-sync` Edge Function, the pg_cron schedule and the Sync now button.

## Decision at the end of the spike
- Nutrition appears in the Garmin API: use it as the nutrition source (scope path A).
- It doesn't: keep logging in MyFitnessPal and enter daily totals by Quick add, or switch to in-app logging with USDA / Open Food Facts search (scope path B).
