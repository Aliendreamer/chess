#!/usr/bin/env bash
# UserPromptSubmit: keep the project's mandatory dev-flow in front of the model.
#
# UNIVERSAL — copy this file to any repo unchanged. Everything project-specific
# lives in context/dev-flow.full.txt next to it.
#
# The contract lands on the first prompt of a session and nothing fires afterwards,
# because root CLAUDE.md already carries the workflow always-loaded. Anything injected
# per prompt is paid on every turn and is never compacted away: the original 193-token
# text cost ~49k over 16 sessions, and even a 160-char pointer is ~40 tokens a turn.
#
# A per-prompt line is still supported — create context/dev-flow.short.txt and it is
# used from the second prompt on — but read the "Per-prompt text" section of README.md
# before you do. There is deliberately no such file here.
set -u

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=./state.sh
. "$HERE/state.sh"

# jq is a hard dependency, and a hook must never fail a turn. Without this guard the
# final emit below exits 127 and writes to stderr on every fire.
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

if hook_claim_once devflow "$(hook_session_id "$input")"; then
    context=$(hook_context "$HERE/context/dev-flow.full.txt")
else
    context=$(hook_context "$HERE/context/dev-flow.short.txt")
fi

# A missing or empty context file means "say nothing" rather than "break the turn".
[ -n "$context" ] || exit 0

jq -cn --arg c "$context" \
    '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$c}}'
