# Header: precompute NAV_ITEMS desktop/mobile filters once

**PR**: #118
**Date**: 2026-05-30

## Changes
- In `frontend/src/lib/components/layout/Header.svelte`, hoisted the two inline
  `NAV_ITEMS.filter(...)` passes out of the markup into script-scope constants
  computed once: `const DESKTOP_NAV = NAV_ITEMS.filter((n) => n.desktop);` and
  `const MOBILE_NAV = NAV_ITEMS.filter((n) => n.mobile);`.
- Updated the desktop `{#each ...}` (was `NAV_ITEMS.filter((n) => n.desktop)`)
  to iterate `DESKTOP_NAV`, and the mobile `{#each ...}` (was
  `NAV_ITEMS.filter((n) => n.mobile)`) to iterate `MOBILE_NAV`. Each keys
  (`(item.href)`) are unchanged.

## Impact
- The sticky header re-renders on every `page.url.pathname` change and every
  `mobileMenuOpen` toggle. Previously both `.filter()` passes re-ran on each of
  those renders even though `NAV_ITEMS` is a static const that is never mutated.
  Now the two filtered arrays are computed once at module/component init.

## Behavior preservation
- `NAV_ITEMS` is a static, never-mutated const, so the filtered results are
  invariant across renders — moving the filter to init-time produces the exact
  same arrays in the same order.
- The `{#each}` blocks render identical items with identical `(item.href)` keys,
  classes, attributes, and text. Output is byte-identical.
- `svelte-kit sync` + `svelte-check --threshold error` pass with 0 errors.
