# Kaizen — Remove dead icon/singleSelect props from FilterDropdown

**PR**: #331
**Date**: 2026-03-14

## Changes
- Removed `icon` and `singleSelect` from FilterDropdownProps interface and destructuring
- Removed `icon={<Ticket .../>}` and `singleSelect` from caller
- Removed orphaned `Ticket` import from lucide-react

## Impact
- Code quality improvement, no behavior changes (props were accepted but never used)
- Reduced lint warnings from 33 to 31
- Kaizen category: dead-code
