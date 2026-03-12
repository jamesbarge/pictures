# Fix sql.raw() SQL injection antipattern in verify-screening-integrity

**Date**: 2026-03-12
**Type**: Security
**Files changed**: `scripts/verify-screening-integrity.ts`

## Problem

The `verify-screening-integrity.ts` script used `sql.raw()` with string
interpolation to build an SQL `IN` clause from cinema slug pairs. While the data
was hardcoded (not user-supplied), `sql.raw()` bypasses Drizzle's parameterization
and the pattern could easily be copied into user-facing code, creating a SQL
injection vulnerability.

## Solution

Replaced the `sql.raw()` call with Drizzle's parameterized `sql` tagged template
literal:

- Each cinema pair is now a parameterized `sql` fragment:
  `sql\`(s1.cinema_id = ${legacy} AND s2.cinema_id = ${canonical})\``
- Fragments are combined with `sql.join(conditions, sql\` OR \`)`
- The outer query uses a standard `sql` template instead of `sql.raw()`

This ensures all values flow through Drizzle's parameter binding, matching the
safe pattern already used elsewhere in the same file (e.g., Assertion 1's
`legacyIdsSql`).
