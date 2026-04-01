#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"
file="$(jq -r '.tool_input.file_path // .tool_input.path // empty' <<< "$input")"

PROTECTED="lefthook.yml tsconfig.json .oxfmtrc.json oxlint.config.ts .oxfmtignore .prettierignore"

for p in $PROTECTED; do
  case "$file" in
    *"$p"*)
      echo "BLOCKED: $file is a protected config file. Fix the code, not the linter/formatter config." >&2
      exit 2
      ;;
  esac
done
