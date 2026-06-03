# Add unit tests for src/lib/telegram.ts

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/telegram.test.ts` (new) — 9 vitest cases.

## Coverage
- Happy path: POST to api.telegram.org/bot<token>/sendMessage with chat_id + MarkdownV2 parse_mode
- Level emoji selection (ℹ️ default, ⚠️ warn, 🚨 error)
- MarkdownV2 escape pass — pins escape of `(`, `)`, `.` (reserved chars that crash Telegram if unescaped)
- Missing token → returns false, no fetch
- Missing chat_id → returns false, no fetch
- API non-2xx → returns false
- Network error → returns false (catch-all)

## Why
`sendTelegramAlert` is the alerting backbone for cron jobs, scraper failures, and data-quality regressions. A regression that throws instead of returning false would crash the caller (most callers don't try/catch). A regression in MarkdownV2 escaping would silently drop messages (Telegram rejects the request) — and the existing return-false-on-non-2xx semantics would mask the issue.

## Changelog deferral note
Per #523-#530.
