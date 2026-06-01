#!/usr/bin/env bash
# Serial perf-PR merge controller — incident-hardened.
# For each PR (impact order): ensure up-to-date with main -> wait for the 4 required
# checks green -> squash-merge -> wait for prod deploy -> smoke-check api+www -> next.
# Circuit-breaks on: merge failure, smoke 200-failure, CI failure, or 3 consecutive skips.
# Excludes #582/#583 (lazy-mount PRs flagged for human review).
set -uo pipefail
cd /Users/jamesbarge/Documents/code/filmcal2

PRS="586 587 594 595 596 599 585 588 590 600 589 597 591 592 593 598 601 602"
LOG=/tmp/perf_merge.log
: > "$LOG"
merged=0; skipped=0; consec_skip=0

smoke() {
  local a w
  a=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://api.pictures.london/api/cinemas)
  w=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -L https://www.pictures.london/)
  echo "$a $w"
}

# pre-flight smoke
read pa pw < <(smoke); echo "[preflight] api=$pa www=$pw" | tee -a "$LOG"
if [ "$pa" != "200" ] || [ "$pw" != "200" ]; then echo "ABORT: site not healthy at start" | tee -a "$LOG"; exit 1; fi

for pr in $PRS; do
  echo "===== PR #$pr =====" | tee -a "$LOG"
  # skip if already merged/closed
  st=$(gh pr view "$pr" --json state --jq .state 2>/dev/null)
  if [ "$st" != "OPEN" ]; then echo "  state=$st, skip" | tee -a "$LOG"; continue; fi

  # ensure up to date with main (strict)
  ms=$(gh pr view "$pr" --json mergeStateStatus --jq .mergeStateStatus 2>/dev/null)
  if [ "$ms" = "BEHIND" ]; then echo "  behind -> update-branch" | tee -a "$LOG"; gh pr update-branch "$pr" >/dev/null 2>&1; sleep 10; fi

  # poll until CLEAN (green+up-to-date) or detect failure; ~10 min cap
  ok=0
  for i in $(seq 1 40); do
    ms=$(gh pr view "$pr" --json mergeStateStatus --jq .mergeStateStatus 2>/dev/null)
    if [ "$ms" = "CLEAN" ]; then ok=1; break; fi
    if [ "$ms" = "BEHIND" ]; then gh pr update-branch "$pr" >/dev/null 2>&1; sleep 8; continue; fi
    # detect a hard failure among checks
    if gh pr checks "$pr" 2>/dev/null | grep -qiE "fail|error"; then echo "  CI FAILED (state=$ms)" | tee -a "$LOG"; break; fi
    sleep 15
  done

  if [ "$ok" != "1" ]; then
    echo "  SKIP #$pr (not mergeable: $ms)" | tee -a "$LOG"
    gh pr edit "$pr" --add-label needs-attention >/dev/null 2>&1
    skipped=$((skipped+1)); consec_skip=$((consec_skip+1))
    [ "$consec_skip" -ge 3 ] && { echo "CIRCUIT BREAK: 3 consecutive skips" | tee -a "$LOG"; break; }
    continue
  fi
  consec_skip=0

  # merge
  if gh pr merge "$pr" --squash >/dev/null 2>&1; then
    echo "  MERGED #$pr" | tee -a "$LOG"
    merged=$((merged+1))
  else
    echo "  MERGE FAILED #$pr -> circuit break" | tee -a "$LOG"; break
  fi

  # wait for prod deploy, then smoke check
  sleep 150
  read a w < <(smoke); echo "  post-merge smoke: api=$a www=$w" | tee -a "$LOG"
  if [ "$a" != "200" ] || [ "$w" != "200" ]; then
    echo "CIRCUIT BREAK: site unhealthy after #$pr (api=$a www=$w)" | tee -a "$LOG"; break
  fi
done

echo "===== DONE: merged=$merged skipped=$skipped =====" | tee -a "$LOG"
read fa fw < <(smoke); echo "final smoke: api=$fa www=$fw" | tee -a "$LOG"
