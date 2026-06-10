# iCal Injection Hardening

**PR**: #657
**Date**: 2026-06-10

## Problem

Calendar export escaped line-feed characters in text fields but did not handle
carriage returns. It also wrote stored booking URLs directly into the `URL`
property, allowing malformed data to inject additional iCal properties.

## Changes

- Normalize CRLF and bare carriage returns before escaping iCal text.
- Only emit booking links with valid HTTP or HTTPS URLs.
- Omit unsafe URLs from both the event URL property and description.
- Extract pure calendar serialization into `src/lib/ical.ts`.
- Add regression tests for text-property injection and unsafe URL schemes.

## Impact

- Compromised or malformed scraped screening data can no longer inject arbitrary
  properties into downloaded calendar events.
- Valid HTTP(S) booking links continue to appear in calendar events.

## Verification

- `npx vitest run src/lib/ical.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:run`
