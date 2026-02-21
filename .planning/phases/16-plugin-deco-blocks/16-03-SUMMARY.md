---
phase: 16-plugin-deco-blocks
plan: "03"
subsystem: scanner
tags: [typescript, ts-json-schema-generator, bun-glob, json-schema, deco-blocks, ast]

requires:
  - phase: 16-01
    provides: "packages/mesh-plugin-deco-blocks workspace scaffolded with ts-json-schema-generator dependency"

provides:
  - "extractPropsSchema() and extractReturnTypeSchema() internal helpers in schema-extractor.ts"
  - "scanBlocks() and scanLoaders() public scanner API in scanner.ts"
  - "BlockDefinition and LoaderDefinition TypeScript interfaces exported from package"
  - "index.ts updated to re-export all scanner and schema-extractor public APIs"

affects:
  - 16-plugin-deco-blocks
  - 17-site-editor

tech-stack:
  added:
    - "TypeScript compiler API (ts.createProgram) for AST inspection without additional deps"
  patterns:
    - "Two-phase schema extraction: try 'Props' first, fall back to AST-inspected first-param type name"
    - "RootlessError catch-and-retry for non-standard Props type names (Pitfall 1 mitigation)"
    - "Bun.Glob('**/*.{ts,tsx}').scan() for native file traversal without glob dependency"
    - "Fast pre-filter: /\\bexport\\s+default\\b/.test(text) before any AST work"
    - "findTsConfig() walks up 3 parent levels — never hardcodes tsconfig location (Pitfall 3 mitigation)"

key-files:
  created:
    - packages/mesh-plugin-deco-blocks/src/schema-extractor.ts
    - packages/mesh-plugin-deco-blocks/src/scanner.ts
  modified:
    - packages/mesh-plugin-deco-blocks/src/index.ts

key-decisions:
  - "RootlessError (not NoRootTypeError) is the actual error name in ts-json-schema-generator — caught and handled for Props fallback"
  - "TypeScript compiler API used for AST inspection instead of ts-morph — avoids additional dependency since typescript is already a peer dep of ts-json-schema-generator"
  - "extractReturnTypeSchema returns {} when return type is unannotated (valid for loaders without explicit return types)"
  - "scanBlocks propagates errors with file path context rather than swallowing them (must-be-complete-or-throw policy)"

patterns-established:
  - "Bun.Glob.scan() for async file traversal (no glob/fast-glob dependency needed)"
  - "Two-phase schema extraction with RootlessError catch-and-retry pattern"
  - "isExcluded() set-based filter for node_modules/dist/.deco directories"

requirements-completed:
  - BLK-01
  - BLK-02

duration: 2min
completed: 2026-02-21
---

# Phase 16 Plan 03: Implement Block and Loader Scanner Summary

**Block/loader scanner with two-phase JSON Schema extraction via ts-json-schema-generator — tries "Props" first, falls back to TypeScript AST inspection for non-standard prop type names, using Bun.Glob for file traversal**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-21T13:51:33Z
- **Completed:** 2026-02-21T13:53:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented `schema-extractor.ts` with `extractPropsSchema()` (two-phase: tries "Props" → falls back to AST-inspected first param type) and `extractReturnTypeSchema()` (unwraps Promise<T> via AST for loader return types)
- Implemented `scanner.ts` with `scanBlocks()` (uses Bun.Glob, pre-filters by export default, discriminates kind by folder path) and `scanLoaders()` (extends scanBlocks with return type schemas)
- Updated `index.ts` to re-export all public scanner and schema-extractor APIs

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement schema-extractor.ts — TypeScript props to JSON Schema** - `f65ac6af7` (feat)
2. **Task 2: Implement scanner.ts — block and loader discovery** - `59409a5be` (feat)

## Files Created/Modified

- `packages/mesh-plugin-deco-blocks/src/schema-extractor.ts` - extractPropsSchema() and extractReturnTypeSchema() using ts-json-schema-generator with TypeScript compiler API fallback for AST inspection
- `packages/mesh-plugin-deco-blocks/src/scanner.ts` - scanBlocks() and scanLoaders() using Bun.Glob, export-default pre-filter, folder-path kind discrimination, tsconfig walk-up
- `packages/mesh-plugin-deco-blocks/src/index.ts` - Re-exports BlockDefinition, LoaderDefinition, scanBlocks, scanLoaders, extractPropsSchema, extractReturnTypeSchema

## Decisions Made

- Used `RootlessError` (the actual error class name in ts-json-schema-generator) rather than `NoRootTypeError` as the plan described — discovered by inspecting the library source
- Avoided adding ts-morph as an additional dependency for AST inspection; the TypeScript compiler API (`typescript` package) is already a transitive dependency of ts-json-schema-generator and sufficient for inspecting first-parameter type annotations
- `extractReturnTypeSchema()` returns `{}` for unannotated return types — acceptable because some loaders don't have explicit return type annotations
- Used `Set<string>` for excluded directory names to make exclusion O(1) rather than repeated string comparisons
- `findTsConfig()` walks up 3 parent levels from `projectRoot` — configurable constant avoids hardcoding the tsconfig location regardless of project nesting depth

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected error class name from NoRootTypeError to RootlessError**
- **Found during:** Task 1 (schema-extractor.ts implementation)
- **Issue:** Plan and research docs referred to "NoRootTypeError" but inspection of ts-json-schema-generator source shows the actual class is `RootlessError` in `src/Error/Errors.ts`
- **Fix:** Used `RootlessError` in the catch clause — this is the correct class for catching "type not found" errors
- **Files modified:** `packages/mesh-plugin-deco-blocks/src/schema-extractor.ts`
- **Verification:** TypeScript check passes, import compiles correctly
- **Committed in:** `f65ac6af7` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug: wrong error class name)
**Impact on plan:** Essential fix — using the wrong class would have caused all RootlessError exceptions to propagate as unhandled errors, breaking the Props-not-named-Props fallback entirely.

## Issues Encountered

None beyond the RootlessError class name correction documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `scanBlocks()` and `scanLoaders()` are ready for Phase 17 (site-editor) to call with any deco project root
- `DECO_BLOCKS_BINDING` (from Plan 16-01) + scanner (this plan) provide the complete foundation for site-editor to populate the block palette
- TypeScript check passes in packages/mesh-plugin-deco-blocks and across all workspaces
- Plan 16-04 can proceed to implement the MCP tools (BLOCKS_LIST, LOADERS_LIST) that wire the scanner to the binding

---
*Phase: 16-plugin-deco-blocks*
*Completed: 2026-02-21*
