-- AutoResearch experiments table
-- Records every experiment run by AutoScrape and AutoQuality systems

-- Create the experiment system enum
DO $$ BEGIN
  CREATE TYPE experiment_system AS ENUM ('autoscrape', 'autoquality', 'autoconvert');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS autoresearch_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system experiment_system NOT NULL,
  target_id TEXT NOT NULL,
  config_snapshot JSONB NOT NULL,
  metric_before REAL NOT NULL,
  metric_after REAL NOT NULL,
  kept BOOLEAN NOT NULL,
  notes TEXT,
  tokens_used INTEGER,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying experiments by system and target
CREATE INDEX IF NOT EXISTS idx_autoresearch_experiments_system
  ON autoresearch_experiments (system, target_id, created_at DESC);

-- Index for querying recent experiments
CREATE INDEX IF NOT EXISTS idx_autoresearch_experiments_created_at
  ON autoresearch_experiments (created_at DESC);

-- RLS: enable and grant service role full access
ALTER TABLE autoresearch_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on autoresearch_experiments"
  ON autoresearch_experiments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
