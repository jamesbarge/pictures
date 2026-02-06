-- Migration: Add bfi_import_runs table
-- Purpose: Persist BFI importer run status for admin visibility and alerting

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'bfi_import_run_type'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.bfi_import_run_type AS ENUM ('full', 'changes');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'bfi_import_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.bfi_import_status AS ENUM ('success', 'degraded', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.bfi_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type public.bfi_import_run_type NOT NULL,
  status public.bfi_import_status NOT NULL,
  triggered_by TEXT,
  source_status JSONB NOT NULL,
  pdf_screenings INTEGER NOT NULL DEFAULT 0,
  changes_screenings INTEGER NOT NULL DEFAULT 0,
  total_screenings INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error_codes TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  errors TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bfi_import_runs_created_at_idx
  ON public.bfi_import_runs(created_at);

CREATE INDEX IF NOT EXISTS bfi_import_runs_status_created_at_idx
  ON public.bfi_import_runs(status, created_at);

CREATE INDEX IF NOT EXISTS bfi_import_runs_run_type_created_at_idx
  ON public.bfi_import_runs(run_type, created_at);

ALTER TABLE public.bfi_import_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bfi_import_runs'
      AND policyname = 'Allow service_role full access to bfi_import_runs'
  ) THEN
    CREATE POLICY "Allow service_role full access to bfi_import_runs"
      ON public.bfi_import_runs FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
