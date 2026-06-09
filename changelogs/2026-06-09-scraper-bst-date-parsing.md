# Scraper BST Date Parsing

**PR**: TBD
**Date**: 2026-06-09

## Changes
- Replaced runtime-local date parsing in Phoenix, Olympic, and David Lean with the shared UTC-safe date parser.
- Reused the shared time parser in Genesis so ambiguous early clock hours default to PM.
- Removed Close-Up search-page runtime-local date construction.
- Expanded the BST regression suite across all five affected scrapers and added an invalid-time regression for David Lean.

## Impact
- Prevents screenings from shifting to the previous day during BST and prevents invalid David Lean times from becoming midnight screenings.
