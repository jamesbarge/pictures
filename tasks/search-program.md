# Search Program — "improve search significantly"

User directive (2026-05-31). Current search is strong: RRF (tsvector + trigram) over
films/cinemas/screenings/festivals/seasons, NL intent parser (parse-query.ts), polished
cmd+k palette ("genuinely excellent" per live audit). So improvements are about
**coverage, capability, and conceptual understanding**, not fixing something broken.

## Shipped
- **Lever 1 — Coverage + relevance (PR #638, in CI).** Removed the 30-day film cap
  (was hiding 256/1082 = 24% of upcoming films); exact/prefix-title score boosts.
  Verified read-only vs prod.

## Planned levers (ranked)

### Lever 2 — People search + `/people/[name]` pages  [no new deps]
- **Why:** new discovery axis — search a director/actor, land on their upcoming London
  showings. `films.directors` (text[]) + `films.cast` (jsonb CastMember[]) already exist;
  `/directors` lists names but they link nowhere and aren't searchable as entities.
- **Backend:** `GET /api/people/[name]` → person's upcoming films (director OR cast) + role,
  via `name = ANY(directors)` / cast jsonb match joined to future screenings.
  Extend `/api/films/search` with a `people[]` group (distinct matched names + upcoming count).
- **Frontend:** `PersonResult` kind + `PEOPLE` section + `PersonRow`; palette mapping;
  `/people/[name]/+page.svelte` (ISR, mirrors festivals/[slug]) with Person JSON-LD;
  link `/directors` entries to it.
- **SEO co-benefit:** indexable "[director] films showing in London" pages.
- **Note:** the `/api/films/search` extension touches route.ts → sequence AFTER #638 merges
  to avoid a same-file conflict.

### Lever 3 — Richer `/search` results page  [no new deps]
- The dedicated `/search` page is "basic". Make it a real filterable/paginated multi-entity
  results surface (films/people/cinemas/screenings) consuming the existing API. Self-contained
  frontend route files; benefits automatically from Lever 1's coverage.

### Lever 4 — Relevance & synonym polish + "did you mean"  [no new deps]
- Synonym expansion at the intent layer (sci-fi↔science fiction already partly in vocab);
  empty-state suggestions when 0 results (nearest trigram title, "browse all").

### Lever 5 — Semantic / conceptual search  [NEEDS DECISION: new dependency]
- **Why:** the headline "5x" — "films about grief", "neon-noir", "feel-good" — impossible
  with lexical/trigram alone.
- **Architecture (FOSS, no paid API per project rule):**
  - pgvector extension on Supabase (Pro) + `films.title_embedding vector(384)` (schema already
    has a commented-out `titleEmbedding` line — intended endgame) + HNSW index.
  - Embeddings via a **small in-process model** (Transformers.js `all-MiniLM-L6-v2`, 384-dim,
    ~25MB quantized) used for BOTH offline precompute AND prod query embedding. (The existing
    `src/lib/embeddings.ts` is Ollama bge-m3 — offline pipeline only, NOT reachable from Vercel
    serverless, so it can't serve query-time embedding in prod.)
  - Fuse cosine distance as a 3rd RRF ranker behind a flag so it can't regress lexical search.
- **DECISION REQUIRED:** adding `@huggingface/transformers` is a NEW runtime dependency
  (project rule: don't add deps without asking) AND introduces ~1–2s cold-start on the first
  query per serverless instance (warm after). Recommend: approve the dep + build it guarded,
  OR defer. Will surface to James with a recommendation when Levers 2–4 are shipping.

## Sequencing
1. Merge #638 (in CI). 2. Lever 2 (people) — non-route parts now, route extension post-#638.
3. Lever 3 (/search page). 4. Lever 4 (polish). 5. Lever 5 (semantic) — after dep decision.
Each: branch → implement → verify (Playwright mobile+desktop for UI; verify-script for backend)
→ changelog (both) → code-review on 3+ files → PR → merge on CI-green.

## Also surfaced (not search, but high-impact — flagged to James)
- 🔴 **Prod auth broken:** Vercel `PUBLIC_CLERK_PUBLISHABLE_KEY` is a `pk_test_` dev key →
  `/sign-in` blank, all signed-in features dead. Fix = set the `pk_live_` prod key in Vercel
  (only James has it). Code is correct. Blocks the retention bets (alerts, sync, "For You").
- P2s from audit: festivals list past/future unsorted; live Sundance festival empty programme;
  a duplicate Matador screening (dedup gap); desktop nav missing /tonight,/cinemas,/festivals;
  favicon 404.
