---
phase: 16-plugin-deco-blocks
plan: "02"
subsystem: docs
tags: [deco, blocks, sections, loaders, claude-skills, ai-context, markdown]

# Dependency graph
requires:
  - phase: 16-01
    provides: mesh-plugin-deco-blocks package scaffolded with DECO_BLOCKS_BINDING
provides:
  - BLOCKS_FRAMEWORK.md — canonical AI context doc explaining deco blocks mental model (sections, loaders, composition, props)
  - enable-blocks Claude skill — framework-agnostic skill for adding deco block support to any JS/TS project
  - create-block Claude skill — skill for creating sections/loaders/both in an existing deco site
affects: [16-03, 16-04, 17-site-editor, any-deco-project-user]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claude skills follow .claude/commands/deco/ frontmatter format with name, description, allowed-tools"
    - "Skills reference BLOCKS_FRAMEWORK.md via @context block for mental model loading"
    - "AI context docs use structured headers targeting Claude as primary reader, not human developers"

key-files:
  created:
    - packages/mesh-plugin-deco-blocks/BLOCKS_FRAMEWORK.md
    - packages/mesh-plugin-deco-blocks/.claude/commands/deco/enable-blocks.md
    - packages/mesh-plugin-deco-blocks/.claude/commands/deco/create-block.md
  modified: []

key-decisions:
  - "Skills placed at packages/mesh-plugin-deco-blocks/.claude/commands/deco/ satisfying BLK-06 requirement for in-package placement"
  - "BLOCKS_FRAMEWORK.md written from scratch (no existing doc found in repo) with full mental model coverage including 8 sections and 226 lines"
  - "Both skills reference BLOCKS_FRAMEWORK.md via @context for automatic mental model injection into Claude's context"

patterns-established:
  - "Deco Claude skills: always load BLOCKS_FRAMEWORK.md via @context block before executing skill logic"
  - "enable-blocks: detect framework from package.json, create framework-appropriate examples (React .tsx, Astro .astro, plain .ts)"
  - "create-block: infer block type (section/loader/both) from user intent; explain auto-discovery (no registration needed)"

requirements-completed: [BLK-05, BLK-06]

# Metrics
duration: 2min
completed: 2026-02-21
---

# Phase 16 Plan 02: plugin-deco-blocks Documentation and Claude Skills Summary

**BLOCKS_FRAMEWORK.md AI context doc (226 lines, 8 sections) plus two Claude skills — enable-blocks and create-block — shipped inside packages/mesh-plugin-deco-blocks/**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T13:45:46Z
- **Completed:** 2026-02-21T13:48:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `BLOCKS_FRAMEWORK.md` as a comprehensive AI context document covering all 7 topic areas (blocks mental model, sections, loaders, page composition, .deco folder, props philosophy, key rules) plus a patterns reference section — 226 lines total
- Created `enable-blocks.md` Claude skill covering framework detection (Next.js, Astro, plain TS) and framework-appropriate example block generation
- Created `create-block.md` Claude skill covering block type inference, props design, loader-to-section type wiring, and auto-discovery explanation

## Task Commits

Each task was committed atomically:

1. **Task 1: Write BLOCKS_FRAMEWORK.md** - `a72094d9c` (docs)
2. **Task 2: Write Claude skills enable-blocks and create-block** - `d6d517459` (docs)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified

- `packages/mesh-plugin-deco-blocks/BLOCKS_FRAMEWORK.md` — 226-line AI context document covering the full deco blocks mental model, written for Claude as primary reader
- `packages/mesh-plugin-deco-blocks/.claude/commands/deco/enable-blocks.md` — Claude skill for adding deco block support to any JS/TS project (framework-agnostic: Next.js, Astro, plain TS)
- `packages/mesh-plugin-deco-blocks/.claude/commands/deco/create-block.md` — Claude skill for creating sections, loaders, or both in an existing deco site

## Decisions Made

- Skills placed inside the package at `.claude/commands/deco/` satisfying BLK-06's in-package requirement without creating an unnecessary separate sub-package
- BLOCKS_FRAMEWORK.md written from scratch (no existing doc found in this monorepo per research Pitfall 5) with full mental model coverage
- Both skills use `@context` block to reference BLOCKS_FRAMEWORK.md, ensuring Claude loads the mental model before executing the skill

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 16-02 complete: documentation and Claude skills shipped
- Plan 16-03 is next: scanner implementation (block/loader file discovery with ts-json-schema-generator)
- All three assets (BLOCKS_FRAMEWORK.md, enable-blocks skill, create-block skill) are immediately usable by developers working on deco projects

---
*Phase: 16-plugin-deco-blocks*
*Completed: 2026-02-21*

## Self-Check: PASSED

- FOUND: packages/mesh-plugin-deco-blocks/BLOCKS_FRAMEWORK.md
- FOUND: packages/mesh-plugin-deco-blocks/.claude/commands/deco/enable-blocks.md
- FOUND: packages/mesh-plugin-deco-blocks/.claude/commands/deco/create-block.md
- FOUND: .planning/phases/16-plugin-deco-blocks/16-02-SUMMARY.md
- FOUND: commit a72094d9c (Task 1)
- FOUND: commit d6d517459 (Task 2)
