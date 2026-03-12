# About Page Nav Link

**Date**: 2026-03-12
**Type**: Enhancement
**PR**: #XX

## Summary
Added an About link to the site navigation so users can discover the About page from the header and mobile drawer.

## Changes
- Added `Info` icon import from lucide-react
- Added `{ href: "/about", icon: Info, label: "About" }` to NAV_ITEMS
- Added DesktopNavButton for About in the desktop nav section
- Fixed invalid HTML: `<button>` was nested inside `<Link>` in DesktopNavButton (interactive element inside interactive element)

## Why
The About page existed but was not accessible from the main navigation. Users had no way to discover it unless they knew the URL.
