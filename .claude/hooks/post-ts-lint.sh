#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"
file="$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<< "$input")"

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.vue) ;;
  *) exit 0 ;;
esac

pnpm format "$file" >/dev/null 2>&1 || true
pnpm lint:fix "$file" >/dev/null 2>&1 || true
diag="$(pnpm lint "$file" 2>&1 | head -20)" || true

if [ -n "$diag" ]; then
  jq -Rn --arg msg "$diag" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $msg
    }
  }'
fi
