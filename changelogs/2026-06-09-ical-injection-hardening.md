# iCal Injection Hardening

**PR:** TBD

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

## Verification

- `npx vitest run src/lib/ical.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:run`
