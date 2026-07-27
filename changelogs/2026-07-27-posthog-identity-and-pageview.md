# Fix PostHog identity churn and the dropped landing pageview; filter the bot fleet

**PR**: TBD
**Date**: 2026-07-27
**Branch**: `fix/posthog-identity-and-pageview`

Two code fixes plus one zero-code PostHog settings change. Together they make the
project's numbers trustworthy for the first time — every previous conclusion about
retention, bounce rate, top pages and traffic growth was distorted by these three faults.

## 1. Identity churned on every page load → retention was unmeasurable

`initPostHog` called `instance.init(..., { persistence: 'memory' })` and the provider
"upgraded" to `localStorage+cookie` afterwards via `set_config`. That is broken in two ways:

- posthog-js mints a fresh `distinct_id`/`$device_id` whenever `get_distinct_id()` is empty,
  and a `memory` store is empty on **every** page load. So every visit became a new person.
- `PostHogPersistence.update_config` copies the *current* (memory) props into the new store
  and `save()`s, so the upgrade **overwrote** the id a returning visitor already had.

Net effect: one new "person" per page load, forever. This is what produced
"348 people with exactly 1 session, 2 with more" — while device fingerprinting proved real
humans returning (one Croydon iPhone appeared as 8 distinct `person_id`s across 6 separate
days; 25 fingerprints accounted for 86 person_ids).

**Fix:** choose the store at init, never patch it — `persistence: alreadyConsented ?
'localStorage+cookie' : 'memory'`, where `alreadyConsented` is `cookieConsent.canTrack` read
synchronously before init. A first-time visitor still gets `memory` (nothing written
pre-consent, so the GDPR posture is unchanged); the post-consent `set_config` then promotes
that brand-new id, which is correct *for them*. A returning consented visitor now initialises
straight from `localStorage+cookie` and adopts their stored id.

Also added **`person_profiles: 'always'`**. Without it the posthog-js default
`identified_only` applied: 5,347 of 5,347 events carried `$process_person_profile: false`,
only 22 person rows existed project-wide, and `person_id` was merely a UUIDv5 hash of the
churning `distinct_id`. Retention/stickiness/lifecycle could not work even with persistence
fixed. Cost is per tracked person (~900/60d here — immaterial).

## 2. The landing pageview of every visit was silently discarded

`PostHogProvider.svelte` called `trackPageview()` inside the loader's `.then()`, while
`opt_out_capturing_by_default: true` was still in force — so the capture was dropped. It then
set `lastPath`, and the retry effect only fires when the path **changes**, so a visit that
never navigated lost its pageview entirely. That is why 407 `$opt_in` events produced only
134 pageview persons, and why desktop capture read as 13% against mobile's 69%.

**Fix:** fire the landing pageview from the consent effect, at the moment capturing is
actually enabled, guarded on `lastPath === ''` (real pathnames always start with `/`, so it
cannot collide). This also correctly handles reject-then-accept, and someone who navigates
before consenting.

**Found while fixing it:** `startSessionRecording()` ran *before* `lastAppliedDecision` was
set. It lazy-loads the rrweb bundle over the network, so a throw there would abort the effect
and silently disable **both** the landing pageview and every path-change pageview after it.
It now runs last, wrapped in try/catch — session recording is the least important thing that
effect does and must never take pageview capture down with it.

## 3. PostHog project filter: exclude the automated fleet (no code)

~60% of recent raw weekly "users" are a single third-party headless-Chrome fleet that
PostHog's own bot detection scores `$virt_is_bot = False, $virt_traffic_type = 'Regular'`.

**A previous analysis proposed filtering `$os=Linux AND $device_type=Desktop AND
$browser_language=en-US AND America/* timezone` and claimed zero collateral. That was wrong** —
it only checked Europe/London. Over 180 days that cohort contains 7 genuine pageviews, 7
autocaptures and 3 film views. Re-derived a precise discriminator instead:

| cohort | viewport | screen | Chrome | events | persons | pageviews | autocaptures |
|---|---|---|---|---|---|---|---|
| fleet | **1919** | 1920 | 149.0 | 643 | 262 | **0** | **0** |
| real Linux user | 993 | 1280 | 143.0 | 33 | 1 | 7 | 7 |

`$viewport_width = 1919` is exclusive to the fleet across **all** platforms — genuine users at
1920×1080 report a viewport of **1920** (Windows: 984 events / 204 pageviews) or 1912. The
headless browser consistently reserves 1px for a scrollbar. So the filter added is a single
rule, `$viewport_width is_not 1919`, appended to the two existing filters (`lastName is_not
Barge`, `$host not_icontains localhost`). Zero collateral, reversible, applies to every
`filterTestAccounts` query and insight.

### Corrected traffic baseline

| week (Mon) | raw users | **real users** | fleet persons |
|---|---|---|---|
| 2026-07-20 | 242 | **91** | 151 |
| 2026-07-13 | 196 | **89** | 107 |
| 2026-07-06 | 49 | 48 | 1 |
| 2026-06-29 | 54 | 51 | 3 |
| 2026-06-22 | 93 | 93 | 0 |
| 2026-06-01 | 110 | 110 | 0 |

The fleet **first appears around 2026-06-29**. Real weekly users are flat at **83–113** — the
July "doubling" was entirely artificial. Any growth conclusion drawn from July is void.

## Files

- `frontend/src/lib/analytics/posthog-config.ts` (**new**) — pure init config, extracted so it
  is unit-testable. `posthog.ts` imports `$app/environment` and `$env/static/public`, neither
  of which resolves in the node test env; this mirrors the existing `catalog-index-core` split.
- `frontend/src/lib/analytics/posthog-config.test.ts` (**new**) — 6 tests.
- `frontend/src/lib/analytics/posthog.ts` — `initPostHog(instance, alreadyConsented)`.
- `frontend/src/lib/analytics/PostHogProvider.svelte` — pass consent to init; move the landing
  pageview into the consent effect; guard `startSessionRecording()`.
- `frontend/tests/analytics-consent.spec.ts` (**new**) — runtime identity cover.

## Verification

| check | result |
|---|---|
| `npm run check` | **0 errors** (4 pre-existing warnings, untouched files) |
| `npm test` | **92 passed** (was 86; +6) |
| frontend E2E | **201 passed, 0 failed, 7 skipped** |
| production build | clean |

**Both new tests were verified to actually fail against the old code**, not just pass against
the new — the important half of writing a regression test:

- Unit: reverting `persistence` to a bare `'memory'` fails 2 of the 6 assertions.
- E2E: the same revert fails with *"a returning visitor must keep their distinct_id"* on all
  3 attempts, and passes once restored.

### What is NOT covered, and why

The E2E test asserts only on posthog's **persisted state**, never on captured events. Event
capture is not observable in this harness: `/ingest/*` is not proxied by the preview server, so
posthog-js never drains its queue. Stubbing it was attempted and abandoned after three tries —
even the automatic `$opt_in` event never appeared, so the harness could not distinguish a
working pipeline from a broken one. (One real bug did fall out of that attempt: the
`startSessionRecording()` ordering above.) A trap worth recording: posthog fetches
`/ingest/array/<token>/config.js`, whose path contains `/config` but which is a **script** —
a naive stub that checks `/config` before `.js` serves it JSON and throws `SyntaxError:
Unexpected token ':'` inside posthog's bootstrap, leaving the SDK half-initialised and
capturing nothing.

So the landing-pageview ordering is covered by **code review and the config unit test**, not
by an executable end-to-end assertion. Confirm it against production once deployed: the
per-person `$opt_in`-without-`$pageview` gap (273 of 407 persons) should collapse.

## Impact

- **Retention becomes measurable for the first time.** Cohort, retention, stickiness and
  lifecycle insights were all structurally broken and are now viable — but only for data
  ingested *from now on*. Historical retention cannot be reconstructed.
- **Pageviews stop under-counting**, especially for single-page visits, so bounce rate and
  top-pages become meaningful.
- **Traffic figures stop being inflated ~2.5×** on desktop.
- ⚠️ Expect apparent weekly users to **drop sharply** in the next report. That is the
  correction, not a regression.

## Follow-ups

1. Re-baseline everything after ~2 weeks of clean data before making product bets on it.
2. Wire the 4 `trackSearch*` helpers (still zero call sites) — PIC-43.
3. Consider stamping an `is_automation` property in `web-vitals.ts` as a durable
   second line of defence if the fleet's viewport changes.
