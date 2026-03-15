# Kaizen — Extract triggerQaStep() from QA orchestrator

**PR**: #352
**Date**: 2026-03-15

## Changes
- Extracted `triggerQaStep()` generic helper that wraps `tasks.triggerAndWait()` with error formatting and Telegram alerts
- Replaced two identical 28-line try/catch/alert blocks with 3-line function calls
- Net -18 lines, making the pipeline flow readable as a linear sequence

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
