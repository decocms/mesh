---
phase: 02-block-scanner
plan: 01
subsystem: scanner
tags: [ts-morph, ts-json-schema-generator, json-schema, typescript-ast, mcp, react-components]

# Dependency graph
requires:
  - phase: 01-plugin-shell
    provides: "ServerPlugin tool pattern, SITE_BINDING toolCaller, page-api pattern, query-keys structure"
provides:
  - "Scanner pipeline (extract, discover, schema) for TypeScript -> JSON Schema conversion"
  - "CMS_BLOCK_SCAN server tool for automated component discovery"
  - "CMS_BLOCK_LIST, CMS_BLOCK_GET, CMS_BLOCK_REGISTER server tools"
  - "Client block-api with listBlocks and getBlock helpers"
  - "Block query keys for React Query cache"
  - "BlockDefinition type as canonical block format in .deco/blocks/"
affects: [02-02, 03-visual-editor, 04-loaders]

# Tech tracking
tech-stack:
  added: [ts-morph@^27.0.2, ts-json-schema-generator@^2.4.0]
  patterns: [in-memory-ts-morph-from-mcp, json-schema-ref-inlining, block-definition-format]

key-files:
  created:
    - packages/mesh-plugin-site-editor/server/scanner/types.ts
    - packages/mesh-plugin-site-editor/server/scanner/extract.ts
    - packages/mesh-plugin-site-editor/server/scanner/discover.ts
    - packages/mesh-plugin-site-editor/server/scanner/schema.ts
    - packages/mesh-plugin-site-editor/server/tools/block-scan.ts
    - packages/mesh-plugin-site-editor/server/tools/block-list.ts
    - packages/mesh-plugin-site-editor/server/tools/block-get.ts
    - packages/mesh-plugin-site-editor/server/tools/block-register.ts
    - packages/mesh-plugin-site-editor/client/lib/block-api.ts
  modified:
    - packages/mesh-plugin-site-editor/server/tools/index.ts
    - packages/mesh-plugin-site-editor/client/lib/query-keys.ts
    - packages/mesh-plugin-site-editor/package.json

key-decisions:
  - "Used ts namespace from ts-morph for JsxEmit enum (not directly exported as named)"
  - "Cast ts.Program through unknown to bridge ts-morph/ts-json-schema-generator TypeScript version mismatch"
  - "Inline $ref definitions in generated schemas for @rjsf compatibility (depth limit 10 for circular refs)"
  - "Block IDs use -- separator for path components (sections/Hero.tsx -> sections--Hero)"
  - "Zod v4 z.record requires explicit key schema (z.string())"

patterns-established:
  - "In-memory ts-morph Project from MCP: useInMemoryFileSystem + LIST_FILES/READ_FILE via proxy"
  - "Block definition format: .deco/blocks/{id}.json with schema, defaults, metadata.customized"
  - "Merge strategy on re-scan: auto-generated fields overwritten, user-customized fields preserved"
  - "Block server tool pattern: same as page tools with connectionId + MCP proxy"

# Metrics
duration: 7min
completed: 2026-02-14
---

# Phase 2 Plan 1: Block Scanner Summary

**ts-morph scanner pipeline reading source files via MCP, discovering React components, generating JSON Schema with ref inlining, and four block server tools (scan/list/get/register) plus client block-api**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-14T12:55:59Z
- **Completed:** 2026-02-14T13:03:47Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Built full scanner pipeline: extract.ts creates in-memory ts-morph Project from MCP file reads, discover.ts finds default+named React component exports with props type detection, schema.ts generates JSON Schema via ts-json-schema-generator with $ref inlining
- Created 4 block server tools: CMS_BLOCK_SCAN orchestrates the full pipeline and writes .deco/blocks/, CMS_BLOCK_LIST/GET read block definitions, CMS_BLOCK_REGISTER enables manual block creation
- Client block-api mirrors page-api pattern with listBlocks/getBlock through SITE_BINDING toolCaller
- Tool registry now exports 9 tools (5 page + 4 block)

## Task Commits

Each task was committed atomically:

1. **Task 1: Scanner pipeline -- types, extract, discover, schema** - `dec863983` (feat)
2. **Task 2: Block server tools and client API helpers** - `1fe08263c` (feat)

## Files Created/Modified
- `server/scanner/types.ts` - BlockDefinition, ComponentInfo, ScanResult, BlockSummary, JSONSchema7 types
- `server/scanner/extract.ts` - createProjectFromMCP: builds in-memory ts-morph Project from MCP LIST_FILES/READ_FILE
- `server/scanner/discover.ts` - discoverComponents: finds default/named React component exports, extracts props type and JSDoc
- `server/scanner/schema.ts` - generateSchema: ts-json-schema-generator from ts-morph program with $ref inlining and fallback
- `server/tools/block-scan.ts` - CMS_BLOCK_SCAN: full pipeline orchestrator with merge strategy for re-scans
- `server/tools/block-list.ts` - CMS_BLOCK_LIST: reads all .deco/blocks/ JSON files, returns summaries
- `server/tools/block-get.ts` - CMS_BLOCK_GET: reads single block definition with full schema
- `server/tools/block-register.ts` - CMS_BLOCK_REGISTER: manual block definition creation
- `server/tools/index.ts` - Added 4 block tool imports and registrations
- `client/lib/block-api.ts` - listBlocks and getBlock via SITE_BINDING toolCaller
- `client/lib/query-keys.ts` - Added blocks.all and blocks.detail query keys + blockKeys shorthand
- `package.json` - Added ts-morph and ts-json-schema-generator dependencies

## Decisions Made
- Used `ts` namespace from ts-morph for `JsxEmit` enum since ts-morph does not re-export it as a named export
- Cast `project.getProgram().compilerObject` through `unknown` to `ts.Program` to bridge TypeScript version mismatch between ts-morph's bundled TS and ts-json-schema-generator's TS
- Implemented $ref inlining with depth limit of 10 to handle circular references safely while making schemas @rjsf-compatible
- Zod v4 `z.record()` requires two arguments (key schema + value schema), unlike v3 which accepted just value schema

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ts-morph does not export JsxEmit as named export**
- **Found during:** Task 1 (extract.ts)
- **Issue:** `import { JsxEmit } from "ts-morph"` fails -- JsxEmit lives on the `ts` namespace
- **Fix:** Import `ts` from ts-morph and use `ts.JsxEmit.ReactJSX`
- **Files modified:** server/scanner/extract.ts
- **Committed in:** dec863983

**2. [Rule 3 - Blocking] TypeScript version mismatch between ts-morph and ts-json-schema-generator**
- **Found during:** Task 1 (schema.ts)
- **Issue:** ts-morph bundles its own TypeScript version via @ts-morph/common, creating incompatible types with ts-json-schema-generator's TypeScript
- **Fix:** Cast `compilerObject` through `unknown as ts.Program` using typescript import for the target type
- **Files modified:** server/scanner/schema.ts
- **Committed in:** dec863983

**3. [Rule 1 - Bug] Zod v4 z.record() API change**
- **Found during:** Task 2 (block-get.ts, block-register.ts)
- **Issue:** `z.record(z.unknown())` fails in Zod v4 which requires explicit key schema
- **Fix:** Changed to `z.record(z.string(), z.unknown())`
- **Files modified:** server/tools/block-get.ts, server/tools/block-register.ts
- **Committed in:** 1fe08263c

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All fixes necessary for compilation. No scope creep.

## Issues Encountered
- Pre-existing `sonner` module not found errors in client components (from Phase 1) -- not related to this plan, ignored

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Scanner pipeline and all block tools ready for Phase 2 Plan 2 (Block Scanner UI)
- Client can list and fetch blocks through block-api helpers
- Query keys ready for React Query integration in UI components
- Block definitions will be written to .deco/blocks/ when CMS_BLOCK_SCAN is called

---
*Phase: 02-block-scanner*
*Completed: 2026-02-14*
