#!/usr/bin/env bash
# Shared per-session marker helper for the Claude Code hooks in .claude/settings.json.
#
# WHY THIS EXISTS: a hook's `additionalContext` is injected into the conversation on
# EVERY fire and is never compacted away. Measured over a 50-session window, the
# dev-flow reminder fired 147 times (~28k tokens) and the prefer-Serena nag 356 times
# (~11k tokens) — all of it re-stating text that had not changed. The markers below
# let a hook say something once per session and stay quiet afterwards.
#
# Markers live outside the repo (a temp dir keyed on uid) so they vanish with the
# machine's temp sweep and never show up in `git status`.

hook_state_dir() {
    printf '%s/cc-hook-state-%s' "${TMPDIR:-/tmp}" "${UID:-$(id -u)}"
}

# hook_session_id <hook-stdin-json>
# The session id, reduced to characters that are safe in a filename. Hook input is
# machine-generated, but it becomes a path here, so it is filtered rather than trusted.
hook_session_id() {
    printf '%s' "$1" | jq -r '.session_id // "unknown"' 2>/dev/null | tr -cd 'A-Za-z0-9._-'
}

# hook_claim_once <marker-name> <session-id>
# Exit 0 exactly once per (marker, session) — the caller then prints its context.
# Any later call for the same pair exits 1, so the caller prints nothing.
hook_claim_once() {
    local dir marker
    dir=$(hook_state_dir)
    mkdir -p "$dir" 2>/dev/null || return 1
    marker="$dir/$1-${2:-unknown}"
    [ -e "$marker" ] && return 1
    # Opportunistic sweep: only on the once-per-session path, so it costs nothing
    # on the hot path.
    find "$dir" -type f -mtime +7 -delete 2>/dev/null
    : > "$marker" 2>/dev/null || return 1
    return 0
}

# hook_context <file>
# The text a hook should inject, read from a project-owned file. Prints nothing
# when the file is absent or empty — that is how a repo opts out of one hook
# without editing settings.json, and it is why every caller treats an empty
# result as "stay silent" rather than as an error. Trailing newlines are stripped
# so the injected string has no dangling whitespace.
hook_context() {
    [ -r "$1" ] || return 0
    sed -e :a -e '/^[[:space:]]*$/{$d;N;ba' -e '}' "$1" 2>/dev/null
}
