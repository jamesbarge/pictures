# Kaizen — Standardize catch variable naming in scraper utils

**PR**: #149
**Date**: 2026-03-12

## Changes
- Renamed `catch (e)` to `catch (error)` in veezi-scraper.ts (3 instances)
- Renamed `catch (e)` to `catch (error)` in film-matching.ts (1 instance)
- Renamed `catch (e)` to `catch (error)` in screening-classification.ts (1 instance)

## Impact
- Code quality improvement, no behavior changes
- Consistent error variable naming makes catch blocks grep-able
- Kaizen category: error-handling
