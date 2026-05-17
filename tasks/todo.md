# Goal — Make /scrape the Best It Can Be

**Set:** 2026-05-15
**Scope:** All independent + repertory cinemas in London, plus associated chains (Curzon, Picturehouse, Everyman).

## Ground Truth — what's actually broken (snapshot 2026-05-15)

From last 7 days of `scraper_runs`:

| Cinema | Severity | Symptom |
|---|---|---|
| **BFI IMAX** | 🔴 critical | 14/21 success+0 (67% empty); avg 2 screenings/run; only 2 upcoming next 30 days |
| **BFI Southbank** | 🔴 critical | 10/20 success+0 (50% empty); still highest-volume venue (584 upcoming when it works) |
| **Close-Up** | 🟡 high | 3/9 outright failures (33%); avg 39 screenings |
| **Silent-breaker detector** | 🟡 high | Only flags **consecutive** zeros — misses alternating empty/non-empty flakiness; returned "none" while both BFIs are bleeding data |

No quarantined cinemas, no stale cinemas. The visible health is masking flakiness.

## Plan — in priority order

### Phase 1 — Tighten detection (1-2 hr) [start here]
- [ ] Add ratio-based signal to `detectSilentBreakers`: flag when ≥X% of last N runs are `success+0` even if not consecutive
- [ ] Add yield-drop signal: flag when current avg yield is <Y% of trailing baseline
- [ ] Wire both into `/scrape health` output
- [ ] Add unit tests for the new detectors

**Decision points the user shapes (5-10 lines):**
- Ratio threshold (50%? 60%? two-tier warn/critical?)
- Baseline window (30d? 14d?)
- Yield-drop threshold (50%? 30%?)

### Phase 2 — Fix BFI flakiness (2-4 hr)
- [ ] Trace `loadBFIScreenings()` end-to-end on a flaky run — log what the PDF importer is seeing on empty cycles
- [ ] Determine: is it Cloudflare blocking the discovery page, the PDF URL changing, parser failing on certain layouts, or a caching/race issue?
- [ ] Add a "yield gate" — if BFI PDF returns < 50 screenings, fail the run rather than recording success+0
- [ ] (Stretch) Cache the last-known-good PDF URL in a manifest so retries work even if discovery fails

### Phase 3 — Fix Close-Up failures (1-2 hr)
- [ ] Pull stderr from the 3 failed runs in scraper_runs to see actual error
- [ ] Patch root cause

### Phase 4 — Coverage gap audit (2-3 hr)
- [ ] Research London independents not in registry (Cinema Museum, Catford Mews, Whirled, Bertha DocHouse, etc.)
- [ ] For each candidate: confirm public listings, design scraper approach (Playwright/Cheerio/API/PDF)
- [ ] Implement top 1-3

### Phase 5 — `/scrape` UX polish (1 hr, last)
- [ ] Add per-wave timing breakdown to the final report
- [ ] Surface "yield deltas vs 7d baseline" inline so regressions are obvious next run

## Verification Strategy

Each phase ends with:
1. Unit tests pass (`npm run test:run`)
2. Type check + lint pass
3. For detection changes: replay against last 14 days of `scraper_runs` to confirm signals fire for the right cinemas
4. For scraper fixes: re-run `/scrape-one <slug>` and confirm yield matches expectations
5. **Never** mark complete without running the actual command and inspecting output

## Out of scope (this session)

- Cloudflare bypass alternative (Camoufox, paid proxy) — separate research project
- Off-Mac automation — explicitly rejected per [[feedback_local_only_no_off_mac]]
- Frontend changes
- New auth flows / data model changes
