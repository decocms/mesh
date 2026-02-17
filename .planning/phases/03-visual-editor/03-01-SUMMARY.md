---
phase: 03-visual-editor
plan: 01
subsystem: ui
tags: [postMessage, iframe, react, visual-editor, viewport]

# Dependency graph
requires:
  - phase: 01-plugin-shell
    provides: page-api.ts Page interface, preview-panel.tsx, use-tunnel-url.ts
  - phase: 02-block-scanner
    provides: block-api.ts getBlock, prop-editor.tsx, query-keys.ts
provides:
  - EditorMessage/SiteMessage typed postMessage protocol
  - useEditorMessages hook for iframe communication
  - useIframeBridge hook with useSyncExternalStore for ready handshake
  - BlockInstance interface replacing unknown[] in Page.blocks
  - Three-panel PageComposer layout (section list + preview + prop editor)
  - ViewportToggle component with mobile/tablet/desktop at 375/768/1440px
  - Enhanced PreviewPanel with postMessage integration
affects: [03-visual-editor]

# Tech tracking
tech-stack:
  added: []
  patterns: [useSyncExternalStore for iframe message subscription, queueMicrotask for render-safe postMessage sends, cn() for conditional classNames]

key-files:
  created:
    - packages/mesh-plugin-site-editor/client/lib/editor-protocol.ts
    - packages/mesh-plugin-site-editor/client/lib/use-editor-messages.ts
    - packages/mesh-plugin-site-editor/client/lib/use-iframe-bridge.ts
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx
    - packages/mesh-plugin-site-editor/client/components/viewport-toggle.tsx
  modified:
    - packages/mesh-plugin-site-editor/client/lib/page-api.ts
    - packages/mesh-plugin-site-editor/client/components/preview-panel.tsx

key-decisions:
  - "Used useSyncExternalStore instead of useEffect for iframe message subscription (ban-use-effect lint rule)"
  - "Used queueMicrotask for sending postMessage during render phase to avoid synchronous side effects"
  - "Used queryKeys.blocks.detail instead of blockKeys shorthand to satisfy enforce-query-key-constants lint rule"

patterns-established:
  - "useIframeBridge: useSyncExternalStore-based hook for iframe postMessage with ready handshake"
  - "EditorMessage/SiteMessage: deco:-prefixed discriminated unions for all editor-iframe communication"
  - "Three-panel composer: 260px left sidebar + flex-1 center preview + 320px right prop editor"

# Metrics
duration: 6min
completed: 2026-02-14
---

# Phase 3 Plan 1: Visual Editor Foundation Summary

**Typed postMessage protocol with deco:ready handshake, three-panel PageComposer layout with viewport toggle at 375/768/1440px, and live prop editing via iframe bridge**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-14T13:26:53Z
- **Completed:** 2026-02-14T13:33:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- EditorMessage (4 variants) and SiteMessage (3 variants) discriminated unions define the full editor-iframe protocol
- useEditorMessages hook provides send/subscribe with source and prefix filtering
- useIframeBridge hook uses useSyncExternalStore for the deco:ready handshake state
- BlockInstance interface (id, blockType, props) replaces unknown[] in Page.blocks
- Three-panel PageComposer with breadcrumb, viewport toggle, section list sidebar, preview center, and prop editor right panel
- ViewportToggle renders mobile/tablet/desktop buttons at 375/768/1440px widths
- PreviewPanel enhanced with iframe bridge integration and smooth width transitions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create typed postMessage protocol and BlockInstance type** - `8668b2f00` (feat)
2. **Task 2: Build page composer layout, viewport toggle, and enhanced preview panel** - `f48f5c75a` (feat)

## Files Created/Modified
- `client/lib/editor-protocol.ts` - EditorMessage/SiteMessage discriminated unions, DECO_MSG_PREFIX constant
- `client/lib/use-editor-messages.ts` - useEditorMessages hook with send/subscribe for iframe postMessage
- `client/lib/use-iframe-bridge.ts` - useIframeBridge hook with useSyncExternalStore for ready state
- `client/lib/page-api.ts` - Added BlockInstance interface, changed Page.blocks from unknown[] to BlockInstance[]
- `client/components/viewport-toggle.tsx` - ViewportToggle component with VIEWPORTS constant and lucide-react icons
- `client/components/preview-panel.tsx` - Rewritten with useIframeBridge for postMessage + viewport support
- `client/components/page-composer.tsx` - Three-panel visual editor layout with live prop editing

## Decisions Made
- Used `useSyncExternalStore` instead of `useEffect` for iframe message subscription to comply with the project's ban-use-effect lint rule (React Compiler project)
- Used `queueMicrotask` for sending postMessage during render phase to avoid synchronous side effects while staying effect-free
- Used `queryKeys.blocks.detail` instead of the `blockKeys` shorthand to satisfy the enforce-query-key-constants lint rule
- Used `cn()` from `@deco/ui/lib/utils.ts` for conditional className interpolation per require-cn-classname lint rule
- Removed `useCallback` wrappers per ban-memoization lint rule (React Compiler handles memoization)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted to ban-use-effect lint rule**
- **Found during:** Task 2
- **Issue:** The plan specified useEffect for iframe message subscription, page config sending, and iframe load handling. The codebase has a strict ban-use-effect lint rule (React Compiler project).
- **Fix:** Created use-iframe-bridge.ts using useSyncExternalStore for ready state subscription and queueMicrotask for render-safe postMessage sends. Ref callbacks for iframe load events.
- **Files modified:** use-iframe-bridge.ts (new), preview-panel.tsx, page-composer.tsx
- **Verification:** Lint passes with 0 errors on all staged files
- **Committed in:** f48f5c75a

**2. [Rule 3 - Blocking] Adapted to ban-memoization lint rule**
- **Found during:** Task 1
- **Issue:** Plan specified useCallback for send/subscribe in useEditorMessages. Codebase bans useCallback (React Compiler handles memoization).
- **Fix:** Removed useCallback wrappers, using plain function definitions instead.
- **Files modified:** use-editor-messages.ts
- **Verification:** Lint passes with 0 errors
- **Committed in:** 8668b2f00

**3. [Rule 3 - Blocking] Used cn() for conditional classNames**
- **Found during:** Task 2
- **Issue:** Template literal className interpolation violates require-cn-classname lint rule.
- **Fix:** Imported cn from @deco/ui/lib/utils.ts and used it for conditional class composition.
- **Files modified:** page-composer.tsx
- **Committed in:** f48f5c75a

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking lint issues)
**Impact on plan:** All fixes were necessary to pass pre-commit hooks. No scope creep. The useSyncExternalStore approach is arguably better than useEffect for external subscriptions.

## Issues Encountered
- Pre-existing `sonner` module type error exists across page-editor.tsx, pages-list.tsx, and page-composer.tsx (sonner not in package.json devDependencies). Not introduced by this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- postMessage protocol ready for Plan 03-02 (section list sidebar with drag-and-drop)
- PageComposer has placeholder left panel ready to be replaced with sortable section list
- BlockInstance type enables Plan 03-02 to implement add/remove/reorder operations
- useIframeBridge pattern established for future overlay injection (EDIT-05)

## Self-Check: PASSED

All 7 files verified present. Both commit hashes (8668b2f00, f48f5c75a) verified in git log. SUMMARY.md exists at expected path.

---
*Phase: 03-visual-editor*
*Completed: 2026-02-14*
