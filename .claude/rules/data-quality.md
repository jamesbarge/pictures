# Data Quality Strategy

## Preferred Approach: Claude Code Direct Enrichment

For bulk data cleanup (title fixing, non-film detection, TMDB matching, duplicate merging), **Claude Code writing and executing scripts is dramatically more effective** than the fallback enrichment agent (Claude Haiku via Anthropic API).

### Why Claude Code is better for this
1. **Batch pattern recognition** - Can review hundreds of unmatched films at once, identify event prefixes ("Funeral Parade presents", "Lost Reels", "LAFS PRESENTS:"), and write targeted regex/title-fix arrays
2. **Domain knowledge** - Knows that "Giselle" and "Siegfried" are ballet (reclassify as `live_broadcast`), "Big Mood Series 2" is TV (reclassify as `event`), and "THE GIRL WHO LEPT THROUGH TIME" is a misspelling of the Mamoru Hosoda anime
3. **False positive prevention** - Can maintain a `BAD_MERGE_TMDB_IDS` blocklist to prevent "The Birds" merging into "The Bird's Placebo" or "The World" into "The World According To Bush"
4. **Multi-phase orchestration** - Structures work into phases: delete non-films -> explicit title fixes -> auto-match remaining. Each phase builds on the last
5. **Immediate verification** - Can query the database, run the script with `--dry-run`, review results, fix issues, then execute live - all in one session

### When to use the API agent instead
- Ongoing maintenance of small batches (1-10 films)
- Booking page scraping for metadata extraction
- Cases where TMDB matching needs web search context

### Workflow for major data quality passes
1. Run `npm run audit:fix-upcoming` to identify issues
2. Have Claude Code write `scripts/manual-title-fixes.ts` with explicit fixes
3. Run with `--dry-run`, review, then execute live
4. Re-run the audit to verify improvement

## Key Scripts

| Script | Purpose |
|--------|---------|
| `npm run audit:fix-upcoming` | 8-pass orchestrator (non-film detection -> dedup -> TMDB -> enrichment -> poster -> dodgy detection) |
| `scripts/manual-title-fixes.ts` | Claude Code-generated title fixes + TMDB matching (re-generate each session) |
| `scripts/cleanup-duplicate-films.ts` | TMDB ID + trigram similarity dedup with union-find clustering |
| `npm run cleanup:upcoming` | 4-phase pipeline: title cleanup, TMDB, metadata, Letterboxd |

## AutoResearch (Autonomous Experimentation)

The autoresearch system in `src/autoresearch/` runs AI-driven experiments to improve data quality automatically:

| System | What it does | Metric | Schedule |
|--------|-------------|--------|----------|
| AutoScrape | Repairs broken scrapers via config overlays | Screening Yield Score (0-100) | Nightly 1am UTC |
| AutoQuality | Tunes audit thresholds one-at-a-time | Data Quality Score (0-100) | Daily 2am UTC |

### Key files
- `src/autoresearch/types.ts` — Shared types (ExperimentResult, OvernightSummary)
- `src/autoresearch/experiment-log.ts` — DB logging + Telegram reports
- `src/autoresearch/obsidian-reporter.ts` — Obsidian vault reports
- `src/autoresearch/autoscrape/harness.ts` — AutoScrape experiment loop
- `src/autoresearch/autoquality/harness.ts` — AutoQuality experiment loop
- `src/autoresearch/autoquality/thresholds.json` — Tunable thresholds (agent-modifiable)

### Safety floors (non-negotiable)
- TMDB confidence: never below 0.6
- Auto-merge similarity: never below 0.85
- Max 3 new non-film patterns per experiment

### Slash commands
- `/autoscrape` — Run AutoScrape manually (detect broken scrapers → experiment → Obsidian report)
- `/autoquality` — Run AutoQuality manually (baseline DQS → experiments → Obsidian report)

### Obsidian reports
Written to `/Users/jamesbarge/Documents/Obsidian Vault/Pictures/AutoResearch/`
