-- AutoResearch Config persistence table
-- Stores threshold configs and scraper overlays in the database
-- so Trigger.dev cloud runs accumulate learning across deploys.
--
-- Key patterns:
--   "autoquality/thresholds"           → full thresholds JSON
--   "autoscrape/overlay/{cinemaId}"    → per-cinema config overlay

CREATE TABLE IF NOT EXISTS autoresearch_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- RLS: only service_role can read/write (matches other admin tables)
ALTER TABLE autoresearch_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON autoresearch_config
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed with current default thresholds so the first run has a starting point
INSERT INTO autoresearch_config (key, value, updated_by)
VALUES (
  'autoquality/thresholds',
  '{
    "tmdb": {
      "minTitleSimilarity": 0.6,
      "titleSimilarityWeight": 0.7,
      "competitorThresholdRatio": 0.95,
      "minMatchConfidence": 0.6,
      "yearMatchPenaltyRecovery": 0.5
    },
    "duplicateDetection": {
      "trigramSimilarityThreshold": 0.5
    },
    "dodgyDetection": {
      "maxTitleLength": 80,
      "minYear": 1895,
      "maxYear": 2027,
      "maxRuntime": 600
    },
    "nonFilmDetection": {
      "maxPatternsPerCategory": 30
    },
    "safetyFloors": {
      "minAutoMergeSimilarity": 0.85,
      "minTmdbConfidence": 0.6,
      "maxNewNonFilmPatterns": 3
    }
  }'::jsonb,
  'migration-seed'
)
ON CONFLICT (key) DO NOTHING;
