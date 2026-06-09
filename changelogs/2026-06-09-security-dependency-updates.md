# Patch P0 Dependency Vulnerabilities

**PR**: #649
**Date**: 2026-06-09

## Changes
- Updated the root lockfile to patched non-breaking dependency releases.
- Updated Next.js from 16.2.4 to 16.2.7 to address middleware bypass and related high-severity advisories.
- Added a frontend npm override for patched `js-cookie` 3.0.8 under `svelte-clerk`.

## Impact
- Removes the known high-severity root dependency vulnerabilities affecting the admin middleware gate.
- Removes the frontend `js-cookie` advisory without applying npm's breaking `svelte-clerk` downgrade.
