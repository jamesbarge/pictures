# Kaizen — extract triggerChunkedBatch in scrape-all

**PR**: #367
**Date**: 2026-03-15

## Changes
- Extracted the duplicate chunked batch triggering pattern from the Playwright and Cheerio waves into a shared `triggerChunkedBatch()` helper
- Replaces 26 lines of duplicated chunk-iterate-aggregate logic with 2 one-liner calls
- Net reduction of 11 lines

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
