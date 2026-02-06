-- Migration: Create health_snapshots table for scraper health monitoring
-- Purpose: Track historical health metrics for each cinema scraper
--
-- Features:
--   - Volume metrics: total, 7-day, 14-day future screenings
--   - Freshness metrics: hours since last scrape
--   - Health scores: overall, freshness, volume (0-100)
--   - Anomaly detection: flags and reason codes
--   - Chain comparison: median and percentage metrics
--   - Alerting: triggered alerts and acknowledgment tracking

-- =============================================================================
-- CREATE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.health_snapshots (
  -- Primary key
  id TEXT PRIMARY KEY,

  -- Foreign key to cinema
  cinema_id TEXT NOT NULL REFERENCES public.cinemas(id) ON DELETE CASCADE,

  -- Snapshot timestamp
  snapshot_at TIMESTAMPTZ NOT NULL,

  -- Volume metrics
  total_future_screenings INTEGER NOT NULL,
  next_14d_screenings INTEGER NOT NULL,
  next_7d_screenings INTEGER NOT NULL,

  -- Freshness metrics
  last_scrape_at TIMESTAMPTZ,
  hours_since_last_scrape REAL,

  -- Health scores (0-100)
  overall_health_score REAL NOT NULL,
  freshness_score REAL NOT NULL,
  volume_score REAL NOT NULL,

  -- Anomaly detection
  is_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  anomaly_reasons JSONB DEFAULT '[]'::jsonb,

  -- Chain comparison (for chain venues)
  chain_median INTEGER,
  percent_of_chain_median REAL,

  -- Alerting
  triggered_alert BOOLEAN NOT NULL DEFAULT FALSE,
  alert_type TEXT,
  alert_acknowledged_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- CREATE INDEXES
-- =============================================================================

-- Index for querying by cinema and time
CREATE INDEX IF NOT EXISTS health_snapshots_cinema_time_idx
  ON public.health_snapshots(cinema_id, snapshot_at);

-- Index for finding anomalies
CREATE INDEX IF NOT EXISTS health_snapshots_anomaly_idx
  ON public.health_snapshots(is_anomaly);

-- Index for finding unacknowledged alerts
CREATE INDEX IF NOT EXISTS health_snapshots_alert_idx
  ON public.health_snapshots(triggered_alert, alert_acknowledged_at);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS health_snapshots_time_idx
  ON public.health_snapshots(snapshot_at);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS
ALTER TABLE public.health_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin/Internal table - service_role only
CREATE POLICY "Allow service_role full access to health_snapshots"
  ON public.health_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.health_snapshots IS 'Historical health metrics for cinema scrapers';
COMMENT ON COLUMN public.health_snapshots.anomaly_reasons IS 'Array of anomaly reason codes: critical_stale, warning_stale, zero_screenings, low_volume, sudden_drop, parse_error_suspected';
COMMENT ON COLUMN public.health_snapshots.alert_type IS 'Type of alert: critical_stale, warning_stale, critical_volume, warning_volume, anomaly';
