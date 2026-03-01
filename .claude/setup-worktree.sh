#!/bin/bash
set -e

# WorktreeCreate hook script
# Reads JSON from stdin: { "name": "<worktree-name>", "cwd": "<repo-root>" }
# Must print the new worktree directory path as the last line of stdout.
# All other output must go to stderr (>&2).

NAME=$(jq -r .name)
CWD=$(jq -r .cwd)
DIR="$CWD/.claude/worktrees/$NAME"
BRANCH="claude/$NAME"

# 1. Create git worktree
git -C "$CWD" worktree add -b "$BRANCH" "$DIR" HEAD >&2

# 2. Copy apps/mesh/.env from main repo (contains auth secrets, DB config, etc.)
cp "$CWD/apps/mesh/.env" "$DIR/apps/mesh/.env" 2>/dev/null >&2 || true

# 3. Assign unique ports based on worktree count
# Count existing worktree directories to get a unique offset
OFFSET=$(ls -d "$CWD/.claude/worktrees/"*/ 2>/dev/null | wc -l | tr -d " ")
SERVER_PORT=$((3000 + OFFSET))
CLIENT_PORT=$((4000 + OFFSET))

# 4. Append unique ports to apps/mesh/.env
echo "" >> "$DIR/apps/mesh/.env"
echo "PORT=$SERVER_PORT" >> "$DIR/apps/mesh/.env"
echo "VITE_PORT=$CLIENT_PORT" >> "$DIR/apps/mesh/.env"

echo "Ports assigned: server=$SERVER_PORT, client=$CLIENT_PORT" >&2

# 5. Generate .claude/launch.json with unique ports
mkdir -p "$DIR/.claude"
cat > "$DIR/.claude/launch.json" <<EOF
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dev",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "dev"],
      "port": $SERVER_PORT
    }
  ]
}
EOF

# 6. Install dependencies
cd "$DIR" && bun install >&2

# Must be last line: output the worktree directory
echo "$DIR"
