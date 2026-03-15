# Kaizen — Extract detectAnomalies in Scraper Health Service

**PR**: #372
**Date**: 2026-03-16

## Changes
- Extracted anomaly detection (staleness thresholds + volume checks) and alert type determination from `getCinemaHealthMetrics` into pure `detectAnomalies()` helper
- Reduces the main function from 135 to ~110 lines

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
