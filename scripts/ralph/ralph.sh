#!/usr/bin/env bash
#
# Ralph — an autonomous loop that spawns a fresh agent per story.
#
# Geoffrey Huntley's pattern: every iteration is a NEW instance with clean
# context. The only memory that crosses the boundary is git history, prd.json
# and progress.txt. That is the whole discipline — if a fact is not written
# into one of those three, the next iteration does not know it.
#
#   ./scripts/ralph/ralph.sh [max_iterations]
#   ./scripts/ralph/ralph.sh --tool claude 5
#
# WHY THIS ONE DOES NOT USE jq
#
# The upstream script shells out to jq. This repository already requires Node
# 24 — the ingestion, the briefs and the recorder all run under it — and does
# not have jq, so asking for it would add a prerequisite to a project whose
# rule is that it costs nothing and installs nothing. Node reads its own JSON.
set -uo pipefail

TOOL="claude"
MAX_ITERATIONS=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool) TOOL="$2"; shift 2 ;;
    *) MAX_ITERATIONS="$1"; shift ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1

PRD="$ROOT/prd.json"
PROGRESS="$ROOT/progress.txt"
PROMPT="$ROOT/scripts/ralph/CLAUDE.md"

[[ -f "$PRD" ]] || { echo "No prd.json at $PRD"; exit 1; }
[[ -f "$PROMPT" ]] || { echo "No prompt at $PROMPT"; exit 1; }

# --- the task list, read through node ---------------------------------------
# `remaining` counts stories that are neither done nor blocked on a human.
remaining() {
  node -e '
    const prd = require(process.argv[1]);
    const open = prd.userStories.filter((s) => !s.passes && !s.blockedBy);
    console.log(open.length);
  ' "$PRD"
}

next_story() {
  node -e '
    const prd = require(process.argv[1]);
    const open = prd.userStories
      .filter((s) => !s.passes && !s.blockedBy)
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    console.log(open.length ? open[0].id : "");
  ' "$PRD"
}

branch_name() {
  node -e 'console.log(require(process.argv[1]).branchName || "ralph/work")' "$PRD"
}

# --- the branch --------------------------------------------------------------
BRANCH="$(branch_name)"
if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  git checkout -b "$BRANCH" || exit 1
else
  git checkout "$BRANCH" || exit 1
fi

touch "$PROGRESS"

echo "Ralph: $TOOL, up to $MAX_ITERATIONS iterations, on $BRANCH"
echo "       $(remaining) stories open"

for (( i = 1; i <= MAX_ITERATIONS; i++ )); do
  OPEN="$(remaining)"
  if [[ "$OPEN" == "0" ]]; then
    echo "<promise>COMPLETE</promise>"
    exit 0
  fi

  STORY="$(next_story)"
  echo ""
  echo "──────────────────────────────────────────────────────────────"
  echo "Iteration $i/$MAX_ITERATIONS — story $STORY — $OPEN open"
  echo "──────────────────────────────────────────────────────────────"

  # A fresh instance every time. No --continue, no --resume: carrying context
  # across iterations is the thing this pattern exists to avoid.
  case "$TOOL" in
    claude) claude -p "$(cat "$PROMPT")" --permission-mode acceptEdits ;;
    amp)    amp -x "$(cat "$PROMPT")" ;;
    *)      echo "Unknown tool: $TOOL"; exit 1 ;;
  esac

  # An iteration that changed nothing is an iteration that will change nothing
  # next time either, and ten of those is just an expensive way to do nothing.
  if [[ "$(remaining)" == "$OPEN" ]]; then
    echo ""
    echo "Iteration $i closed no story. Stopping rather than spending the rest"
    echo "of the budget on the same wall — read progress.txt for why."
    exit 1
  fi
done

echo ""
echo "Ran out of iterations with $(remaining) still open."
