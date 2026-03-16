# Kaizen — Extract convertShowings in Regent Street Scraper

**PR**: #379
**Date**: 2026-03-16

## Changes
- Extracted 30-line showing-to-RawScreening conversion loop from `scrape()` into standalone `convertShowings()` method
- `scrape()` now reads as: setup browser → intercept GraphQL → navigate → convert → return
- No behavior changes — pure method extraction

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
