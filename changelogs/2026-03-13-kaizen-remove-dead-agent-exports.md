# Kaizen — Remove Dead Agent Exports

**PR**: #277
**Date**: 2026-03-13

## Changes
- Deleted `ConfidenceLevel` type and `DuplicateDetectionResult` interface from types.ts (zero consumers)
- Deleted `getAgentConfig` function from config.ts (trivial wrapper with zero consumers)
- Unexported `DEFAULT_AGENT_CONFIG` and `CostTracker` (only used internally)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- Reduces public API surface of the agents module
