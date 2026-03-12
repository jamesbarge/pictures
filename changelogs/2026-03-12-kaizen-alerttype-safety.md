# Kaizen — Replace `as any` with proper AlertType in scraper health

**PR**: #146
**Date**: 2026-03-12

## Changes
- Extracted `AlertType` union type (`"critical_stale" | "warning_stale" | "critical_volume" | "warning_volume" | "anomaly"`)
- Changed `CinemaHealthMetrics.alertType` from `string | null` to `AlertType | null`
- Changed `HealthAlert.alertType` from inline union to `AlertType`
- Changed local variable in `getCinemaHealthMetrics` from `string | null` to `AlertType | null`
- Removed `as any` cast in `saveHealthSnapshot`
- Removed `as HealthAlert["alertType"]` cast in `runFullHealthCheck`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: type-safety
