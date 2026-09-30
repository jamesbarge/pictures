# TypeSafe experiments for Pictures — 21 September 2026

The results support two practical next steps: **bring the existing title-normalization paths into closer agreement through reviewed deterministic rules, and improve offline discovery using synopsis metadata before adding model inference.** TypeSafe was useful for identifying difficult cases and rejecting irrelevant matches. The evidence supports a reviewer-assisted offline tool, not automatic data corrections.

The experiment harness is implemented on branch `chore/typesafe-experiments`, based on `340b536e`, in `.worktrees/typesafe-experiments`. Application behavior and production data were not changed. The original checkout's four scraper edits were preserved.

## What was measured

The title benchmark contains 152 cases: synthetic combinations of 74 prefix and 26 suffix fixtures, production-derived listings, and behavioral examples. Pattern families were kept together: 101 cases for development and 51 for holdout. Ambiguous cases and the double-bill policy difference were excluded from comparable title accuracy.

Discovery used a frozen public Pictures snapshot of 80 films, sampled across release decades. Collecting eligible records required 101 detail requests; 21 records were excluded. The 32 constructed queries comprise eight title/director controls, sixteen remembered-plot descriptions, four structured-filter requests, and four no-match requests. Eight queries were reserved for development and 24 for holdout. Relevance labels were authored by the coding agent from the supplied metadata before inference; they are not independent human judgments or real user-query measurements.

Corpus, labels, cases, and both prompt variants' complete request designs were hashed before inference. Development selected the explicit title prompt (`v2`) and the simpler discovery prompt (`v1`) with a minimum relevance Score of 2.5. Holdout results did not change those choices.

The pinned model was `jev-1.13.0`. Recorded budget use was **$0.088431294 of the $5 limit**, across 687 network attempts and 684 valid cached responses. Successful responses reported **1,913,507 input tokens** and **183,593 output tokens**. The budget figure includes conservative allowances for three rejected responses, so it is an upper estimate rather than an invoice. The published input price used was $0.042 per million tokens; output tokens were free. [TypeSafe model documentation](https://docs.typesafe.ai/models)

## Title quality: promising gaps, with important boundaries

| Frozen title-selection / abstention measure | Existing synchronous extractor | TypeSafe, locked v2 |
|---|---:|---:|
| Correct scored holdout cases | 15/50 | **50/50** |
| Development titles, same selected variant | 45/88 | **84/88** |

Of the 50 scored holdouts, 37 are synthetic combinations, ten are behavioral examples, and three are production-derived listings. Of the 35 holdout improvements, 33 are synthetic. The two production-derived improvements were stripping `Relaxed Screening:` from *My Father's Shadow*, and rejecting `Member Library Lates: Guillermo del Toro` as an event without a single underlying film.

That comparison is specifically against `extractFilmTitleSync`. Pictures also has a richer scraper cleaner. A **post-hoc, API-free comparison**, restricted to the same 46 holdout cases with a non-null expected title, found:

| Method | Exact title matches |
|---|---:|
| Synchronous extractor | 12/46 |
| Existing scraper `cleanFilmTitle` | 29/46 |
| Locked TypeSafe selection | 46/46 |

The scraper cleaner fixed 21 cases missed by the synchronous extractor but regressed four others. This is evidence for narrow parity improvements, not a wholesale replacement. Optional local learned patterns were absent in this worktree, and neither comparison measures the end-to-end TMDB matching pipeline.

The perfect holdout title score has limits:

- The holdout contains **no protected-title cases** and no positive compilation or stage-broadcast examples. Title-preservation safety and recall for those event classes remain unmeasured on holdout.
- TypeSafe incorrectly marked `Funeral Parade presents The Godfather Part II` as a compilation, despite selecting the correct title. Title accuracy is not complete-record accuracy.
- Reversing candidate order changed one of twelve title selections: `Comedy: Stand-Up Special` changed from no-match to the original event title, while its non-film flag stayed true. Stability was **11/12** for title selection. The two tested discovery rankings retained the same selected films and order.
- Development errors included `The Old Ways: A Century in Sound`, synthetic birthday-season and ScreenTalk suffixes, and a missing candidate for `Niki de Saint Phalle: 4k Restoration Daddy`. TypeSafe cannot select a title that candidate generation omitted.
- The development confidence-selection rule chose zero, excluding no cases. This does not establish a calibrated threshold for automatic approval.

## Discovery: metadata accounts for most of the improvement

| Holdout measure | Current client palette | Metadata keyword baseline | TypeSafe |
|---|---:|---:|---:|
| Descriptive queries with relevant first result | 1/12 | **11/12** | **12/12** |
| Descriptive nDCG@5 | 0.083 | 0.883 | **0.951** |
| Exact-title/director controls, relevant first result | 6/6 | 6/6 | 6/6 |
| Correctly rejected no-match queries | 0/3 | 1/3 | **3/3** |
| Overall nDCG@5, excluding no-match queries | 0.393 | 0.904 | **0.972** |

nDCG@5 measures how close the first five results are to the supplied graded relevance ordering; one is ideal. The palette baseline is the actual client title/director index. This experiment does **not** compare against the richer PostgreSQL server search or TMDB-powered similar-film rail.

The clearest additional semantic benefit was **Coffy**. For “A hospital worker pursues revenge against the drug trade after a family member is harmed,” keyword search ranked it seventh, behind incidental matches including *Black Narcissus*. TypeSafe ranked it first, with Score 2.99. The synopsis uses *nurse*, *vengeance*, and *younger sister*, providing a concrete paraphrase case for further evaluation.

TypeSafe returned exactly one film for each descriptive request. Its high mean relevance therefore does not imply three useful recommendations per request. The keyword baseline already placed the intended film first in the other eleven cases, but returned many incidental alternatives.

For purely structured requests, the deterministic filters already supply the answer. The keyword baseline missed three eligible animated films because “animated” did not match the stored genre “animation.” Explicit genre/year/runtime filters identified all four. Zero hard-constraint violations chiefly validates those filters, not model reasoning.

The discovery holdout cost **$0.039706548** for 240 requests. Median response time was **257 ms per eight-film batch** and p95 was **429 ms**. Each query used ten batches over the 80-film cohort; these are not end-to-end user-query latency figures.

An independent blinded review identified two debatable labels: “teenage” in the Blair Witch request is not supported by the supplied “student filmmakers” synopsis, and a development query for Billy Wilder could reasonably include a film whose synopsis credits him but whose director field does not. The frozen primary results remain intact. Excluding the disputed Blair Witch holdout query gives descriptive nDCG@5 of **0.955 for TypeSafe and 0.880 for keywords**; the comparative conclusion remains the same.

This is a small fixed-corpus pilot of remembered-plot retrieval. The no-match requests are easy negatives, labels are mostly zero or three, and the holdout reuses the same film corpus. The snapshot includes shorts; future screenings do not establish ticket availability. Forty-five films had no screening explicitly marked available, and one had only a sold-out screening. Fresh user queries, plausible near misses, independently reviewed labels, and a new corpus are needed before product-level claims.

## Proposed changes, in priority order

1. **Fix known complete suffix decorations in both title paths.** Both cleaners turn `Casablanca (London Premiere + Q&A)` into an unmatched-parenthesis fragment. Handle the complete terminal premiere/Q&A decoration before generic discussion stripping. Review VHS and B&W decorations at the same time. Acceptance: full removal of known decoration groups and preservation of `Daisies (Sedmikrásky)`, `A Star Is Born (1954)`, and meaningful title parentheses.

2. **Share a narrow set of reviewed wrapper rules between the existing cleaners.** Synchronize anchored cinema-brand, relaxed-screening, and community-screening patterns where behavior is already understood. Cover colon, spacing, capitalization, and optional-quote variants. Acceptance: `Relaxed Screening: My Father's Shadow`, quoted/unquoted presenters, and senior/community labels normalize correctly, while `Mission: Impossible`, `2001: A Space Odyssey`, sequel numbers, and bilingual titles remain intact. Do not copy broad colon heuristics or all observed prefix strings indiscriminately.

3. **Improve offline metadata retrieval and filter-only handling first.** Extend the offline search benchmark/tool to index synopsis and genre evidence while retaining the exact-title/director path. Normalize genre variants such as animated/animation and let explicit filters return their eligible set directly. Evaluate a relevance cutoff on fresh data to reduce incidental matches. The existing metadata baseline's 11/12 descriptive first results justify testing this cheaper path before expanding inference.

4. **Use TypeSafe as a reviewer-assisted offline tool for difficult cases.** Present the source listing or query, candidate titles/synopses, raw judgments, and disagreements with deterministic rules. Prioritize cases like Coffy, ambiguous branding, and candidate omissions. A reviewer can then propose a durable rule, alias, or editorial tag. Acceptance: no database writes, source evidence visible, contradictory title/event judgments flagged, and no mutation until separately reviewed.

5. **Treat event classification as a separate follow-up.** Development exposed keyword collisions such as `Quiz Show` and `Official Competition`, and festival branding wrongly interpreted as compilation evidence. Replace broad keyword triggers only after adding true-event counterexamples and a fresh positive holdout for each class. Current results do not establish safe automatic event classification.

These are proposals, not applied product changes. Any deterministic implementation should be evaluated on the observed regression cases **and fresh production listings**, with both existing normalization paths tested to prevent transferring one path's regressions into the other.

## Reproducibility and validation

The runner provides capture, baseline, live-development, holdout, stability, and cache-only reporting modes. It freezes request designs, caps concurrency at four, uses bounded retries and timeouts, maintains a persistent budget ledger, and prevents simultaneous CLI writers to the same run. Credentials are read from `TYPESAFE_API_KEY`; request artifacts exclude authorization headers.

The API returns rounded probability distributions that can sum to 0.99. Its Score may differ slightly from the weighted mean of displayed probabilities. Among 3,360 successful Score answers, 2,159 had a nonzero displayed-histogram difference; the maximum was 0.03. The harness retains the authoritative Score and raw probabilities, validates documented types/ranges/options, and records arithmetic differences as diagnostics. [TypeSafe API reference](https://docs.typesafe.ai/api)

Validation completed:

- **58** experiment tests passed, including observed wire-format regressions, caching, budgets, response validation, label isolation, capture eligibility, filtering, and metrics.
- **100** existing title-extraction and enrichment-fixture regression tests passed.
- **60** existing frontend palette/query-parser tests passed.
- Root TypeScript checking passed. Root lint passed with 61 pre-existing warnings and no errors; the experiment directory has no lint findings.
- All development, holdout, and stability results were rebuilt without a credential using cache-only mode. The network-attempt count remained 687 and recorded spending remained unchanged.
- **The full backend suite did not complete.** Workers repeatedly timed out while loading the existing `jsdom` dependency; an independent `require('jsdom')` also stalled during `@asamuzakjp/dom-selector` loading. Those task-owned processes were stopped. Full-suite validation remains outstanding.

See [README.md](README.md) for commands and the ignored `runs/2026-09-21/` directory for the complete corpus, labels, baseline, selections, raw responses, failure evidence, stability results, and `summary.json`. Run `node --import tsx scripts/typesafe-experiments/summarize.ts` to rebuild the consolidated summary without API access.
