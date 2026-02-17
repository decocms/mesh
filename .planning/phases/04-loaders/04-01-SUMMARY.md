---
phase: 04-loaders
plan: 01
subsystem: api
tags: [ts-morph, json-schema, loaders, scanner, mcp-tools]

requires:
  - phase: 02-block-scanner
    provides: "Scanner pipeline (ts-morph, generateSchema, createProjectFromMCP), block tool patterns"
provides:
  - "LoaderDefinition and LoaderInfo types with inputSchema + outputSchema"
  - "discoverLoaders scanner for .ts default-exported async functions"
  - "CMS_LOADER_SCAN, CMS_LOADER_LIST, CMS_LOADER_GET server tools"
  - "Client listLoaders/getLoader helpers via SITE_BINDING"
  - "Loader query keys for React Query"
affects: [04-02, loader-ui, visual-editor-loader-binding]

tech-stack:
  added: []
  patterns:
    - "Loader scanner: separate from component scanner, scans .ts (not .tsx), extracts return type"
    - "Dual schema: LoaderDefinition has both inputSchema (Props) and outputSchema (return type)"
    - "LoaderRef type for binding loader output to block instance props"

key-files:
  created:
    - packages/mesh-plugin-site-editor/server/tools/loader-scan.ts
    - packages/mesh-plugin-site-editor/server/tools/loader-list.ts
    - packages/mesh-plugin-site-editor/server/tools/loader-get.ts
    - packages/mesh-plugin-site-editor/client/lib/loader-api.ts
  modified:
    - packages/mesh-plugin-site-editor/server/scanner/types.ts
    - packages/mesh-plugin-site-editor/server/scanner/discover.ts
    - packages/mesh-plugin-site-editor/server/tools/index.ts
    - packages/mesh-plugin-site-editor/client/lib/query-keys.ts

key-decisions:
  - "Reuse generateSchema for both input and output types rather than creating generateOutputSchema"
  - "Separate discoverLoaders function rather than extending discoverComponents with a mode flag"
  - "Zero-parameter loaders are valid (propsTypeName = null, empty inputSchema)"
  - "LoaderRef type added for future prop-to-loader binding (used in plan 04-02)"

patterns-established:
  - "Loader tools follow exact same ServerPluginToolDefinition pattern as block tools"
  - "Client loader-api mirrors block-api pattern (SITE_BINDING LIST_FILES/READ_FILE)"
  - ".deco/loaders/ directory convention for loader definition storage"

duration: 3min
completed: 2026-02-14
---

# Phase 4 Plan 1: Loader Infrastructure Summary

**Loader scanner, types, server tools, and client API mirroring the block pipeline but with dual input/output schemas**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T13:58:21Z
- **Completed:** 2026-02-14T14:01:17Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- LoaderDefinition type with both inputSchema and outputSchema (key difference from BlockDefinition)
- discoverLoaders scanner that processes .ts files, extracts Props type and unwrapped Promise return type, skips JSX
- Three server tools (SCAN/LIST/GET) registered and writing to .deco/loaders/
- Client helpers and query keys ready for UI consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: LoaderDefinition types and discoverLoaders scanner** - `4c8b010cb` (feat)
2. **Task 2: Loader server tools and client API** - `d06bedc33` (feat)

## Files Created/Modified
- `server/scanner/types.ts` - Added LoaderInfo, LoaderDefinition, LoaderSummary, LoaderRef types
- `server/scanner/discover.ts` - Added discoverLoaders(), unwrapPromise, resolveReturnTypeName helpers
- `server/tools/loader-scan.ts` - CMS_LOADER_SCAN tool: discover + schema gen + write to .deco/loaders/
- `server/tools/loader-list.ts` - CMS_LOADER_LIST tool: list .deco/loaders/ with summaries
- `server/tools/loader-get.ts` - CMS_LOADER_GET tool: read single loader definition by ID
- `server/tools/index.ts` - Registered LOADER_SCAN, LOADER_LIST, LOADER_GET
- `client/lib/loader-api.ts` - listLoaders/getLoader helpers via SITE_BINDING tools
- `client/lib/query-keys.ts` - Added loaders.all/detail query keys + loaderKeys shorthand

## Decisions Made
- Reused existing `generateSchema()` for both input and output type schemas rather than creating a separate function -- the function already accepts any type name
- Created separate `discoverLoaders()` function rather than adding a mode flag to `discoverComponents()` -- cleaner separation, different filtering logic (`.ts` vs `.tsx`, skip JSX vs require JSX)
- Zero-parameter loaders get empty inputSchema (`{ type: "object", properties: {}, additionalProperties: false }`)
- Return type resolution: unwrap `Promise<T>`, strip `| null | undefined`, skip anonymous/inline types

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Loader infrastructure complete, ready for plan 04-02 (loader UI and prop binding)
- All query keys, client API, and server tools in place for UI consumption
- LoaderRef type ready for BlockInstance prop-to-loader binding

## Self-Check: PASSED

All 8 files verified present. Both task commits (4c8b010cb, d06bedc33) confirmed in git log.

---
*Phase: 04-loaders*
*Completed: 2026-02-14*
