-- DQS Snapshot History
-- Records Data Quality Score at the start and end of every AutoQuality run,
-- creating a time-series for trend analysis and Karpathy-style eval.
--
-- Each run produces two rows: snapshot_type = 'start' and 'end'.
-- The run_id links them together.

CREATE TABLE IF NOT EXISTS dqs_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('start', 'end')),
  composite_score REAL NOT NULL,
  missing_tmdb_percent REAL NOT NULL,
  missing_poster_percent REAL NOT NULL,
  missing_synopsis_percent REAL NOT NULL,
  duplicates_percent REAL NOT NULL,
  dodgy_entries_percent REAL NOT NULL,
  total_films INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: only service_role can read/write (matches other admin tables)
ALTER TABLE dqs_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON dqs_snapshots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Index for trend queries (newest first)
CREATE INDEX idx_dqs_snapshots_created_at ON dqs_snapshots (created_at DESC);

-- Index for finding start/end pairs by run
CREATE INDEX idx_dqs_snapshots_run_id ON dqs_snapshots (run_id);
