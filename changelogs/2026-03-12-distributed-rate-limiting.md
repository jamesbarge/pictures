# Distributed Rate Limiting with Upstash Redis

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Replaced in-memory Map-based rate limiter with @upstash/ratelimit backed by Upstash Redis
- Uses sliding window algorithm (more accurate than previous fixed window)
- Graceful fallback to in-memory when UPSTASH_REDIS_REST_URL env vars are not set
- Made checkRateLimit() async; updated all 7 API route call sites
- Updated route test mocks from mockReturnValue to mockResolvedValue
- Added @upstash/ratelimit and @upstash/redis dependencies

## Setup
1. Install Redis from Vercel Marketplace (Settings > Storage > Add > Redis)
2. Auto-provisions Upstash Redis and injects env vars
3. No code changes needed — rate limiter detects env vars at startup

## Impact
- Security: Closes CVSS 4.3 finding — rate limits enforced across all serverless instances
- Accuracy: Sliding window prevents burst attacks at window boundaries
- Backwards compatible: Falls back to in-memory when Redis is unavailable
