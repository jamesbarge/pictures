# Prevent Public Caching of Personalized Festival Data

**PR**: #651
**Date**: 2026-06-09

## Changes
- Added a shared cache-policy helper for routes that optionally include user data.
- Updated festival list and detail responses to use `private, no-store` when authenticated.
- Preserved the existing public edge-cache policies for anonymous festival responses.

## Impact
- Prevents a signed-in user's festival follows and schedule state from being cached and served to another user.
