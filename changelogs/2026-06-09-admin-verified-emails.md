# Require Verified Clerk Emails for Admin Access

**PR**: TBD
**Date**: 2026-06-09

## Changes
- Added a shared helper that returns only normalized, verified Clerk email addresses.
- Updated both admin authorization layers to use the shared verified-email rule.
- Removed the session-claim email shortcut because it did not carry verification proof.

## Impact
- Prevents an unverified secondary Clerk email address from granting access to admin pages or APIs.
