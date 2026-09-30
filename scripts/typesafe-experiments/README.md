# TypeSafe offline experiments

An isolated research harness for Pictures title quality and metadata-based film discovery. It does not import database clients, update application data, send notifications, or add TypeSafe to production request paths. The implementation uses the existing Node, TypeScript, Zod, MiniSearch, and Vitest installations.

## Run the recorded benchmark

From the worktree root, with root and frontend dependencies available:

```sh
# Generate SvelteKit's ignored TypeScript configuration for the real palette import.
cd frontend
node node_modules/@sveltejs/kit/svelte-kit.js sync
cd ..

# No credential or network access needed; freezes input and request-design hashes.
node --import tsx scripts/typesafe-experiments/run.ts baseline

# The original checkout's ignored env file holds TYPESAFE_API_KEY.
node --env-file=../../.env.local --import tsx scripts/typesafe-experiments/run.ts live --phase development
node --env-file=../../.env.local --import tsx scripts/typesafe-experiments/run.ts live --phase holdout
node --env-file=../../.env.local --import tsx scripts/typesafe-experiments/run.ts live --phase stability

# Rebuild results from validated cached responses, without a credential or network calls.
node --import tsx scripts/typesafe-experiments/run.ts report --phase development
node --import tsx scripts/typesafe-experiments/run.ts report --phase holdout
node --import tsx scripts/typesafe-experiments/run.ts report --phase stability
node --import tsx scripts/typesafe-experiments/summarize.ts

# Dedicated Node tests; all HTTP is mocked.
node node_modules/vitest/vitest.mjs run --config scripts/typesafe-experiments/vitest.config.mts
```

The default run directory is `scripts/typesafe-experiments/runs/2026-09-21`. It is ignored by Git and contains the public metadata snapshot, frozen labels, cache, budget ledger, development selections, baseline and holdout results. Use `--out DIR` to select another run. `--experiment quality` or `--experiment discovery` restricts live/replay phases. The default is both.

For a new study, run `capture --out DIR`, author `DIR/queries.json` before inference using the `DiscoveryQuery` interface, and run `baseline --out DIR`. The runner requires 32 explicitly labeled queries across eight controls, sixteen descriptive requests, four hard-constraint requests, and four no-match requests. Development contains respectively two, four, one, and one queries. Label every film; use `null` for uncertain relevance. Do not execute database seed modules to obtain fixtures. Capture refuses to overwrite an existing snapshot.

## Measurement design

- Quality: 152 fixed cases, including 100 synthetic combinations of production-observed prefix/suffix patterns. Family groups stay intact across the 101/51 development/holdout split. Ambiguous titles and the double-bill policy difference are explicitly excluded from comparable title accuracy. Candidate generation only sees the input title, never the expected label.
- Discovery: 80 publicly listed films sampled across decades, then 32 analyst-authored metadata-grounded queries. TypeSafe scores every candidate in batches of eight. Baselines use the actual client palette index and a separate keyword-overlap method over film metadata. These are not benchmarks of server-side PostgreSQL search or the similar-film rail.
- Labels, corpus, cases, and both variants' exact request designs are hashed before inference. Changes invalidate a run instead of silently mixing results. Only development results select the prompt variant and any threshold. Both variants are preregistered; there is no iterative tuning on holdout errors.
- Quality selection maximizes accuracy across scored title and classification assertions (up to four assertions per case), with harmful stripping and the simpler prompt as tie breakers. A review confidence threshold is selected only when at least 20 development titles attain 95% accuracy with no harmful stripping; otherwise no threshold is recommended.
- Discovery selection maximizes `0.8 × mean nDCG@5 + 0.2 × empty/nonempty accuracy`, testing minimum scores of 1, 1.5, 2, and 2.5. Ties prefer the higher threshold and then the simpler prompt. Report rejection accuracy separately on the no-match subset.
- `top3Relevance` is mean judged relevance on the 0–3 scale among the actual top three results. nDCG excludes explicitly unjudged candidates and normalizes against the eligible judged cohort. Both methods apply the same explicit hard constraints. This controlled use of structured constraints does not evaluate natural-language constraint parsing.
- Stability reruns reverse candidate order for twelve quality holdouts and two descriptive discovery holdouts, without changing candidate identities or Score rubric order.

## Budget, failures, and replay

The model is pinned to `jev-1.13.0`; pricing is $0.042 per million input tokens, with free output tokens, as verified in TypeSafe's model documentation on 2026-09-21. The CLI enforces a cumulative maximum of $5 per run. Each in-flight request reserves a conservative allowance before sending; failed or interrupted calls retain conservative charges where actual usage is unknown. Consequently the ledger is an upper estimate, not an invoice.

Four calls may run concurrently. Requests time out after 30 seconds and make at most three attempts for transient errors. Authentication and malformed successful responses stop new work. Valid responses are cached by request identity, including Choice candidate order; replay rejects missing or invalid cache entries and never falls through to the network. Rejected response evidence is sanitized and saved separately from valid results.

Run one CLI process per run directory. A `.run.lock` file prevents concurrent CLI writers. If a process is forcibly killed, first verify it is no longer running before removing that stale lock; keep `cache/budget-ledger.json` intact. Cached results and reservations survive restarts.

Only `TYPESAFE_API_KEY` is read for authentication. Keys and authorization headers are not stored with requests or responses. Never put a credential in command arguments, fixture data, or checked-in files.

Sources: [TypeSafe API](https://docs.typesafe.ai/api), [models and prices](https://docs.typesafe.ai/models), [source-value selection](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook), [reranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe). The skill used is the local Claude plugin's `typesafe-ai/SKILL.md`.
