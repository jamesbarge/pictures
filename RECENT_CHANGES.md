# Recent Changes

<!--
AI CONTEXT FILE - Keep last ~20 entries. Add new entries at top.
When an entry is added here, also create a detailed file in /changelogs/
-->

## 2026-01-19: Fix Duplicate Films from Version Suffixes
**PR**: #51 | **Files**: `src/lib/title-extractor.ts`, `src/lib/title-extractor.test.ts`, `src/scrapers/pipeline.ts`
- Fixed duplicate film records caused by version suffixes like `: Final Cut`, `: Director's Cut`
- Added `canonicalTitle` field to separate display titles from matching titles
- "Apocalypse Now : Final Cut" and "Apocalypse Now" now correctly match to the same film
- Added VERSION_SUFFIX_PATTERNS for colon/hyphen-separated versions

---

## 2026-01-13: Add Changelog System
**Commit**: direct to branch | **Files**: `CLAUDE.md`, `RECENT_CHANGES.md`, `changelogs/`
- Added dual changelog system for AI context
- `/changelogs/` folder for detailed per-PR archives
- `RECENT_CHANGES.md` for quick AI scanning of recent work

---
