#!/bin/sh
set -e

# WorktreeCreate hook script
# Reads JSON from stdin: { "name": "...", "cwd": "..." }
# Must print the new worktree directory path as the last line of stdout.
# All other output must go to stderr (>&2).

# Read stdin once into a variable (stdin can only be consumed once)
INPUT=$(cat)

NAME=$(echo "$INPUT" | jq -r .name)
CWD=$(echo "$INPUT" | jq -r .cwd)
DIR="$CWD/.claude/worktrees/$NAME"
BRANCH="claude/$NAME"

# 1. Create git worktree
git -C "$CWD" worktree add -b "$BRANCH" "$DIR" HEAD >&2

# 2. Copy apps/mesh/.env from main repo (contains auth secrets, DB config, etc.)
cp "$CWD/apps/mesh/.env" "$DIR/apps/mesh/.env" 2>/dev/null >&2 || true

# 3. Install dependencies
cd "$DIR" && bun install >&2

# Must be last line: output the worktree directory
echo "$DIR"
