# Trigger.dev / Scraper Runs Audit — 2026-04-26

Window: last 30 days (2026-03-27 → 2026-04-26)
Cinemas total: 67

## Silent breakers — cinemas with ZERO runs in the window (7)
| Cinema | Has baseline? |
|---|---|
| The Nickel (`nickel`) | **no** |
| Curzon Richmond (`curzon-richmond`) | **no** |
| Curzon Camden (`curzon-camden`) | **no** |
| Curzon Wimbledon (`curzon-wimbledon`) | **no** |
| Olympic Cinema (`olympic`) | **no** |
| Riverside Studios (`riverside`) | **no** |
| Everyman Walthamstow (`everyman-walthamstow`) | **no** |

## No run in last 8 days — orchestrator may be skipping (5)
| Cinema | Last run | Days since |
|---|---|---|
| Rio Cinema | 2026-04-16 | 10 |
| Prince Charles Cinema | 2026-04-13 | 13 |
| David Lean Cinema | 2026-04-04 | 22 |
| Phoenix Cinema | 2026-04-06 | 20 |
| Close-Up Film Centre | 2026-04-15 | 10 |

## Recurring anomalies — ≥2 anomaly runs (0)
None.

## Recurring failures — ≥3 failed runs (0)
None.

## Missing baseline — anomaly detection silently disabled (66)
These cinemas have no `cinema_baselines` row, so `runner-factory.detectAnomaly()` returns null and never flags low/zero-count runs.

| Cinema | Runs in window |
|---|---|
| Barbican Cinema | 6 |
| Rio Cinema | 2 |
| Institute of Contemporary Arts | 5 |
| BFI IMAX | 5 |
| East Dulwich Picturehouse | 4 |
| The Ritzy | 4 |
| Prince Charles Cinema | 4 |
| Picturehouse Central | 5 |
| Hackney Picturehouse | 5 |
| The Nickel | 0 |
| Everyman Broadgate | 5 |
| Everyman Barnet | 5 |
| Finsbury Park Picturehouse | 4 |
| Curzon Hoxton | 5 |
| Everyman Chelsea | 4 |
| Curzon Kingston | 4 |
| Curzon Victoria | 5 |
| Curzon Aldgate | 5 |
| Curzon Soho | 5 |
| Peckhamplex | 6 |
| Curzon Mayfair | 5 |
| Crouch End Picturehouse | 5 |
| Ealing Picturehouse | 4 |
| Everyman Baker Street | 5 |
| Everyman Borough Yards | 5 |
| The Nickel | 5 |
| Genesis Cinema | 5 |
| Curzon Richmond | 0 |
| Curzon Camden | 0 |
| Everyman Hampstead | 4 |
| Screen on the Green | 4 |
| Everyman Stratford International | 4 |
| Everyman King's Cross | 4 |
| Everyman Maida Vale | 4 |
| The Lexi Cinema | 8 |
| Curzon Wimbledon | 0 |
| Electric Cinema Portobello | 6 |
| Clapham Picturehouse | 4 |
| Everyman Crystal Palace | 4 |
| West Norwood Picturehouse | 4 |
| Electric Cinema White City | 5 |
| Everyman Muswell Hill | 4 |
| Curzon Bloomsbury | 5 |
| Everyman Belsize Park | 5 |
| David Lean Cinema | 2 |
| Coldharbour Blue | 4 |
| Castle Sidcup | 5 |
| Close-Up Cinema | 4 |
| Phoenix Cinema | 1 |
| Rich Mix | 6 |
| Garden Cinema | 5 |
| Castle Cinema | 6 |
| ArtHouse Crouch End | 4 |
| Olympic Cinema | 0 |
| Regent Street Cinema | 5 |
| Close-Up Film Centre | 1 |
| Riverside Studios | 0 |
| Olympic Studios | 4 |
| Everyman Canary Wharf | 5 |
| Cine Lumiere | 4 |
| Everyman Walthamstow | 0 |
| Riverside Studios | 4 |
| The David Lean Cinema | 4 |
| Greenwich Picturehouse | 4 |
| The Gate | 4 |
| Phoenix Cinema | 5 |

## Full per-cinema breakdown

| Cinema | Total | Success | Anomaly | Failed | Last run | Last count | Baseline |
|---|---|---|---|---|---|---|---|
| Curzon Camden | 0 | 0 | 0 | 0 | **never** | — | ✗ |
| Curzon Richmond | 0 | 0 | 0 | 0 | **never** | — | ✗ |
| Curzon Wimbledon | 0 | 0 | 0 | 0 | **never** | — | ✗ |
| Everyman Walthamstow | 0 | 0 | 0 | 0 | **never** | — | ✗ |
| Olympic Cinema | 0 | 0 | 0 | 0 | **never** | — | ✗ |
| Riverside Studios | 0 | 0 | 0 | 0 | **never** | — | ✗ |
| The Nickel | 0 | 0 | 0 | 0 | **never** | — | ✗ |
| Close-Up Film Centre | 1 | 1 | 0 | 0 | 2026-04-15 | 31 | ✗ |
| Phoenix Cinema | 1 | 1 | 0 | 0 | 2026-04-06 | 27 | ✗ |
| David Lean Cinema | 2 | 2 | 0 | 0 | 2026-04-04 | 67 | ✗ |
| Rio Cinema | 2 | 2 | 0 | 0 | 2026-04-16 | 67 | ✗ |
| ArtHouse Crouch End | 4 | 4 | 0 | 0 | 2026-04-20 | 29 | ✗ |
| Cine Lumiere | 4 | 4 | 0 | 0 | 2026-04-20 | 321 | ✗ |
| Clapham Picturehouse | 4 | 4 | 0 | 0 | 2026-04-20 | 159 | ✗ |
| Close-Up Cinema | 4 | 3 | 0 | 1 | 2026-04-20 | 17 | ✗ |
| Coldharbour Blue | 4 | 4 | 0 | 0 | 2026-04-20 | 4 | ✗ |
| Curzon Kingston | 4 | 4 | 0 | 0 | 2026-04-20 | 127 | ✗ |
| Ealing Picturehouse | 4 | 4 | 0 | 0 | 2026-04-20 | 303 | ✗ |
| East Dulwich Picturehouse | 4 | 4 | 0 | 0 | 2026-04-20 | 161 | ✗ |
| Everyman Chelsea | 4 | 4 | 0 | 0 | 2026-04-20 | 93 | ✗ |
| Everyman Crystal Palace | 4 | 4 | 0 | 0 | 2026-04-20 | 116 | ✗ |
| Everyman Hampstead | 4 | 4 | 0 | 0 | 2026-04-20 | 76 | ✗ |
| Everyman King's Cross | 4 | 4 | 0 | 0 | 2026-04-20 | 71 | ✗ |
| Everyman Maida Vale | 4 | 4 | 0 | 0 | 2026-04-20 | 56 | ✗ |
| Everyman Muswell Hill | 4 | 4 | 0 | 0 | 2026-04-20 | 106 | ✗ |
| Everyman Stratford International | 4 | 4 | 0 | 0 | 2026-04-20 | 77 | ✗ |
| Finsbury Park Picturehouse | 4 | 4 | 0 | 0 | 2026-04-20 | 344 | ✗ |
| Greenwich Picturehouse | 4 | 4 | 0 | 0 | 2026-04-20 | 228 | ✗ |
| Olympic Studios | 4 | 4 | 0 | 0 | 2026-04-20 | 53 | ✗ |
| Prince Charles Cinema | 4 | 4 | 0 | 0 | 2026-04-13 | 576 | ✗ |
| Riverside Studios | 4 | 4 | 0 | 0 | 2026-04-20 | 98 | ✗ |
| Screen on the Green | 4 | 4 | 0 | 0 | 2026-04-20 | 66 | ✗ |
| The David Lean Cinema | 4 | 4 | 0 | 0 | 2026-04-20 | 59 | ✗ |
| The Gate | 4 | 4 | 0 | 0 | 2026-04-20 | 48 | ✗ |
| The Ritzy | 4 | 4 | 0 | 0 | 2026-04-20 | 235 | ✗ |
| West Norwood Picturehouse | 4 | 4 | 0 | 0 | 2026-04-20 | 258 | ✗ |
| BFI IMAX | 5 | 5 | 0 | 0 | 2026-04-20 | 35 | ✗ |
| BFI Southbank | 5 | 5 | 0 | 0 | 2026-04-20 | 86 | ✓ |
| Castle Sidcup | 5 | 5 | 0 | 0 | 2026-04-20 | 70 | ✗ |
| Crouch End Picturehouse | 5 | 5 | 0 | 0 | 2026-04-26 | 249 | ✗ |
| Curzon Aldgate | 5 | 5 | 0 | 0 | 2026-04-26 | 129 | ✗ |
| Curzon Bloomsbury | 5 | 5 | 0 | 0 | 2026-04-26 | 158 | ✗ |
| Curzon Hoxton | 5 | 5 | 0 | 0 | 2026-04-26 | 83 | ✗ |
| Curzon Mayfair | 5 | 5 | 0 | 0 | 2026-04-26 | 78 | ✗ |
| Curzon Soho | 5 | 5 | 0 | 0 | 2026-04-26 | 78 | ✗ |
| Curzon Victoria | 5 | 5 | 0 | 0 | 2026-04-26 | 139 | ✗ |
| Electric Cinema White City | 5 | 5 | 0 | 0 | 2026-04-20 | 17 | ✗ |
| Everyman Baker Street | 5 | 5 | 0 | 0 | 2026-04-26 | 55 | ✗ |
| Everyman Barnet | 5 | 5 | 0 | 0 | 2026-04-26 | 181 | ✗ |
| Everyman Belsize Park | 5 | 5 | 0 | 0 | 2026-04-26 | 45 | ✗ |
| Everyman Borough Yards | 5 | 5 | 0 | 0 | 2026-04-26 | 65 | ✗ |
| Everyman Broadgate | 5 | 5 | 0 | 0 | 2026-04-26 | 80 | ✗ |
| Everyman Canary Wharf | 5 | 5 | 0 | 0 | 2026-04-26 | 106 | ✗ |
| Garden Cinema | 5 | 5 | 0 | 0 | 2026-04-20 | 158 | ✗ |
| Genesis Cinema | 5 | 5 | 0 | 0 | 2026-04-20 | 98 | ✗ |
| Hackney Picturehouse | 5 | 5 | 0 | 0 | 2026-04-26 | 233 | ✗ |
| Institute of Contemporary Arts | 5 | 5 | 0 | 0 | 2026-04-20 | 58 | ✗ |
| Phoenix Cinema | 5 | 5 | 0 | 0 | 2026-04-20 | 35 | ✗ |
| Picturehouse Central | 5 | 5 | 0 | 0 | 2026-04-26 | 208 | ✗ |
| Regent Street Cinema | 5 | 5 | 0 | 0 | 2026-04-20 | 23 | ✗ |
| The Nickel | 5 | 5 | 0 | 0 | 2026-04-20 | 92 | ✗ |
| Barbican Cinema | 6 | 6 | 0 | 0 | 2026-04-20 | 51 | ✗ |
| Castle Cinema | 6 | 6 | 0 | 0 | 2026-04-20 | 40 | ✗ |
| Electric Cinema Portobello | 6 | 6 | 0 | 0 | 2026-04-20 | 24 | ✗ |
| Peckhamplex | 6 | 6 | 0 | 0 | 2026-04-20 | 47 | ✗ |
| Rich Mix | 6 | 6 | 0 | 0 | 2026-04-20 | 112 | ✗ |
| The Lexi Cinema | 8 | 8 | 0 | 0 | 2026-04-20 | 124 | ✗ |