# ReachableResults: compute urgencyClass once per group via {@const}

**PR**: #115
**Date**: 2026-05-30

## Changes
- In `frontend/src/lib/components/reachable/ReachableResults.svelte`, added a group-scoped `{@const urgencyCss = urgencyClass(urgency)}` immediately after the existing `{@const groupScreenings = groups[urgency]}` inside the `{#each urgencyOrder}` block.
- Replaced the two call sites that previously invoked `urgencyClass(urgency)` directly — the group header `<h2 class="group-label ...">` and the per-card `<div class="leave-badge ...">` — with references to `urgencyCss`.

## Impact
- Affects only the Reachable results view (`ReachableResults.svelte`).
- `urgencyClass` is a pure switch over the group's `urgency`, which is constant for the whole group. Previously it was re-evaluated once per screening card inside the `{#each groupScreenings}` loop. Now it is computed once per urgency group and reused, eliminating redundant switch evaluations on large result sets.

## Behavior preservation
- `urgencyClass(urgency)` is a pure function with no side effects, returning a fixed string per `urgency` value.
- `urgency` does not change within a group, so the single group-scoped computation yields the exact same string the per-card calls would have produced.
- The emitted `class` attribute strings on both the group header and each leave badge are byte-identical to before. No runtime behavior or output changes.
