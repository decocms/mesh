# Site Builder

## What This Is

A Mesh plugin that extends the Task Runner to enable AI-assisted site building with live preview. Users connect to a local Deno/Fresh site, run the dev server, create tasks like "implement a new landing page", and watch the AI agent break it down into a plan, implement each step, and see changes via HMR in real-time.

## Core Value

Users describe what they want in natural language, and an AI agent builds it iteratively with real-time visual feedback.

## Requirements

### Validated

<!-- Existing capabilities from the codebase -->

- ✓ MCP Gateway architecture with plugin system — existing
- ✓ Task Runner plugin with Beads integration — existing
- ✓ Task creation, plan generation, plan approval workflow — existing
- ✓ Agent spawning via Claude Code (AGENT_SPAWN) — existing
- ✓ Quality gates and completion detection — existing
- ✓ local-fs MCP for file read/write — existing
- ✓ Session tracking and status polling — existing

### Active

<!-- New capabilities for this milestone -->

- [ ] Site Builder plugin with preview-first UI layout
- [ ] Connection dropdown filtering for sites (local-fs with deno.json)
- [ ] Stack detection from deno.json/package.json
- [ ] Dev server control (start/stop) via task-runner MCP
- [ ] Live preview iframe with port detection
- [ ] Page/route selector dropdown
- [ ] Reuse task board components in collapsible panel
- [ ] Site context passed to agents for stack-aware editing

### Out of Scope

- Multi-stack support (Next.js, Astro, etc.) — focus on Deno/Deco first
- Remote site deployment — local development only for v1
- Visual page builder / drag-drop — agent builds via code, user watches
- MCP UI in chat panel — not ready yet, use collapsible task panel instead

## Context

**Existing Architecture:**
- `mesh/packages/mesh-plugin-task-runner/` — working task runner UI
- `mcps/task-runner/` — MCP with AGENT_SPAWN, quality gates, memory tools
- `mesh/packages/bindings/` — well-known bindings including TASK_RUNNER_BINDING

**Target Site Stack:**
- Deno + Fresh framework (like decocms/)
- `deno task dev` starts dev server with HMR
- `.deco/blocks/` contains page JSON configs
- `sections/` contains React components

**UI Pattern:**
- Same connection dropdown pattern as Task Runner
- Preview iframe takes most of the screen
- Task board is collapsible/secondary
- Chat panel on right (existing Mesh layout)

## Constraints

- **Tech stack**: Must use existing Mesh patterns (React, TanStack Query, Radix)
- **Reuse**: Should reuse task-runner hooks where possible (useTasks, useAgentSessions)
- **MCP location**: Site tools go in existing task-runner MCP (not a new MCP)
- **Detection**: Stack detection must be robust (deno.json with deco/ import)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Extend task-runner MCP with site tools | Simpler than new MCP, reuses existing agent infrastructure | — Pending |
| Preview-first layout | Site building is visual, tasks are secondary | — Pending |
| Deno/Deco stack first | User's current need, add other stacks later | — Pending |
| Filter connections by deno.json | Auto-detect sites vs generic folders | — Pending |

---
*Last updated: 2026-02-01 after initialization*
