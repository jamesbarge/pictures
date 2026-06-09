# Scraper Failure Propagation

**PR**: TBD
**Date**: 2026-06-09

## Changes
- Added per-venue error reporting to Curzon, Everyman, and Picturehouse chain scrapers.
- Preserved valid empty venue results while omitting failed venue results from chain result maps.
- Updated the shared chain runner to record any requested venue missing from a result map as failed.
- Made total Curzon authentication failure throw so all requested venues are marked failed.
- Made Curzon date requests, Everyman API requests, and Picturehouse API requests propagate failures.
- Made Barbican, Close-Up, and Phoenix fail when required page fetches or parses fail.
- Kept successful legacy chain results persistable before their entry points report partial venue failure.
- Added regression tests for chain and independent scraper failure propagation.

## Impact
- Scraper run history now distinguishes legitimate zero-screening days from fetch, authentication, and parse failures.
- Anomaly and quarantine detectors receive honest failed-run records instead of misleading success-with-zero records.
- Partial multi-page scrapes are not persisted as successful complete coverage.
