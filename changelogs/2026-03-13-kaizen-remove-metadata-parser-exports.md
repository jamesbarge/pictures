# Kaizen — Remove unused exports from metadata-parser

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Removed `export` keyword from 6 functions in metadata-parser.ts that are only used internally
- extractYear, extractRuntime, extractDirector, extractCountry, parseStatsLine, parseParenthetical
- parseFilmMetadata (the public API) remains exported and is used by prince-charles, barbican, and bfi scrapers

## Impact
- Code quality improvement, no behavior changes
- Reduces public API surface of metadata-parser module
- Kaizen category: dead-code
