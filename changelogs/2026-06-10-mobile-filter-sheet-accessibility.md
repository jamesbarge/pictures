# Mobile Filter Sheet Accessibility

**PR**: #656
**Date**: 2026-06-10

## Changes
- Added initial focus, focus trapping, Escape handling, and trigger-focus restoration to the mobile filter sheet.
- Added an independent focus lifecycle for the nested date-picker dialog.
- Passed explicit opener elements into both modal focus traps so restoration also works in touch-mode browsers that do not focus clicked buttons.
- Replaced the decorative cinema-search row with a labeled search input and selectable matching cinema results.
- Added mobile Playwright coverage for modal focus behavior, nested-dialog focus restoration, and cinema search.

## Impact
- Keyboard and assistive-technology users can operate the mobile filter sheet without focus escaping behind the modal.
- Mobile users can now search for and select individual cinemas from the filter sheet.
