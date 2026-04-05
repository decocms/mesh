#!/bin/bash
set -e

cd /app/apps/mesh

# Run database migrations
echo "Running Kysely migrations..."
bun run migrate 2>&1 || echo "Kysely migrations may have already run"

echo "Running Better Auth migrations..."
bun run better-auth:migrate 2>&1 || echo "Better Auth migrations may have already run"

echo "Starting server..."
exec bun run src/index.ts
