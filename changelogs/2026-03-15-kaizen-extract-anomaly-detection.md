# Kaizen — Extract anomaly detection in scraper runner

**PR**: #359
**Date**: 2026-03-15

## Changes
- Extracted `detectAnomaly()` function from inline logic in `recordScraperRun()`
- The extracted function encapsulates baseline deviation calculation, threshold comparison, anomaly type classification (zero_results/low_count/high_count), and expected-range math
- Caller reduced from 21 lines of nested conditional logic to a clean 7-line block

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
- Makes the anomaly detection algorithm independently testable
