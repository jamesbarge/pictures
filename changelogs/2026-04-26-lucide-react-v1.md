# Bump lucide-react to v1

**PR**: TBD
**Date**: 2026-04-26
**Branch**: `chore/lucide-react-v1`

## Changes

- `lucide-react` 0.562.0 → 1.11.0 (the v1.0 stabilization release)
- No source code changes

## Why

Phase 2 item 4 from `tasks/todo.md`. The 1.0 stabilization release locks the icon API after years on the 0.x train.

## Audit

Pulled every unique icon name across the codebase via Python:

```python
re.finditer(r'import\s*\{([^}]+)\}\s*from\s*["\']lucide-react["\']', src, re.DOTALL)
```

Found 78 unique icons used across ~30 files. All 78 still resolve in v1.11.0 — `npx tsc --noEmit` reports no missing-export errors.

The full list (for future reference if names ever do change):

```
Activity, AlertCircle, AlertTriangle, ArrowLeft, BarChart3, Bell, Bike, Bot,
Building2, Calendar, CalendarClock, CalendarPlus, Check, CheckCircle,
CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clapperboard,
ClipboardCheck, Clock, Clock3, Cloud, Cookie, Database, ExternalLink, Eye,
EyeOff, FileText, Film, Filter, Footprints, Globe, Heart, History, Image,
ImageIcon, Info, LayoutDashboard, Leaf, Link2, List, ListFilter, Loader2,
MapPin, Megaphone, Menu, Monitor, Moon, MousePointer, Navigation, Pencil, Play,
Plus, RefreshCw, RotateCcw, Search, Settings, Share2, ShieldAlert, ShoppingCart,
Siren, SlidersHorizontal, Sparkles, Star, Sun, Tag, Ticket, Train, Trash2,
TrendingUp, User, Users, Video, X, XCircle, Zap
```

## Verification

- `npm run lint` → 0 errors, 41 warnings
- `npx tsc --noEmit` → clean (proves every imported icon resolves)
- `npm run test:run` → 913/913 pass

## Impact

- No runtime visual change expected. Icons render the same.
- Bundle size may shift slightly with v1's tree-shaking improvements but the project already imports named icons (which tree-shake cleanly in 0.x and 1.x).
- Phase 2 item 4 of 12 complete.
