# Kaizen — Extract buildExperimentPrompt in AutoQuality harness

**PR**: #381
**Date**: 2026-03-17

## Changes
- Extracted 18-line template replacement block from `runOneExperiment` into a dedicated `buildExperimentPrompt()` function
- The new function takes DQS metrics, thresholds, experiment history, and safety floors, returning the filled prompt string
- `runOneExperiment` now calls the helper, reducing its length from 161 to 143 lines

## Impact
- Code quality improvement, no behavior changes
- Separates template mechanics from experiment logic for better readability
- Kaizen category: readability
