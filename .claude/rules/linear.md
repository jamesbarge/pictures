# Linear Rules (Issue Tracking)

## CRITICAL: This repo uses the Pictures workspace ONLY
- Linear tools in this repo are `mcp__linear-pictures__*` — these point at the **Pictures** workspace.
- **NEVER** use `mcp__plugin_linear_linear__*` here. That is the global plugin authed to the **KareHero** (work) workspace. Using it would file Pictures issues into KareHero.
- The `linear-pictures` server is a **local-scope** connection (private to this machine + project), authenticated via OAuth to the Pictures workspace under a **separate Linear account/email** from KareHero.

## Verify before any Linear write
Before creating, updating, commenting on, or moving any issue, confirm you are in Pictures:
- Call `mcp__linear-pictures__get_user` with `"me"` (or `list_teams`).
- The KareHero workspace exposes teams: Engineering (ENG), Product & Design (PD), Design (DES), Brand Design, Product Management, Marketplace Growth, and the user `james@karehero.com`. If you see ANY of these, STOP — you are on the wrong connection.
- Proceed only when the workspace/teams clearly belong to the Pictures cinema project.

## Working with issues from Claude Code
- **Reference**: "work on PIC-12" → fetch with `mcp__linear-pictures__get_issue`, read description + comments, then implement.
- **Branch naming**: use Linear's git branch format so commits auto-link, e.g. `james/pic-12-fix-bfi-times`. (Linear's "Copy git branch name" gives the canonical one.)
- **PR auto-close**: put a magic word in the PR title/body — `Fixes PIC-12` / `Closes PIC-12` — so merging moves the issue to Done.
- **Lifecycle**: set status with `save_issue` (e.g. In Progress when you start, leave closing to the PR magic word). Add progress notes with `save_comment`.
- **Create issues** with `save_issue`; pick the Pictures team. Use clear titles, repro steps, and link the relevant `file:line`.

## Setup / re-auth
- Re-authenticate or check status via `/mcp` in the Claude Code TUI (select `linear-pictures`).
- Re-register if needed: `claude mcp add -s local -t http linear-pictures https://mcp.linear.app/mcp`
- Remove: `claude mcp remove linear-pictures -s local`
