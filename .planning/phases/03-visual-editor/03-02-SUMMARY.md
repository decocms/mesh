---
phase: 03-visual-editor
plan: 02
subsystem: ui
tags: [dnd-kit, sortable, drag-and-drop, block-picker, visual-editor, react]

# Dependency graph
requires:
  - phase: 03-visual-editor
    provides: PageComposer three-panel layout, editor-protocol postMessage, useIframeBridge, BlockInstance type
  - phase: 02-block-scanner
    provides: block-api.ts listBlocks/getBlock, prop-editor.tsx, query-keys.ts
provides:
  - SectionListSidebar with @dnd-kit sortable DnD reordering
  - BlockPicker modal with category grouping and search filter
  - Fully wired PageComposer with add/delete/reorder/edit blocks
  - Page editor route rendering visual composer instead of metadata form
affects: [03-visual-editor]

# Tech tracking
tech-stack:
  added: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/modifiers", "@dnd-kit/utilities"]
  patterns: [arrayMove for DnD reordering, applyPageUpdate helper for local state + debounced save]

key-files:
  created:
    - packages/mesh-plugin-site-editor/client/components/section-list-sidebar.tsx
    - packages/mesh-plugin-site-editor/client/components/block-picker.tsx
  modified:
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx
    - packages/mesh-plugin-site-editor/client/components/page-editor.tsx
    - packages/mesh-plugin-site-editor/package.json

key-decisions:
  - "Used @deco/ui Dialog (Radix) for block picker modal -- already used in pages-list.tsx"
  - "applyPageUpdate helper centralizes local state mutation + debounced save pattern"
  - "Query cache invalidation added on both debounced and manual save for consistency"

patterns-established:
  - "applyPageUpdate: centralized updater pattern for local page state + debounced git save"
  - "blockLabel: derive display name from blockType by splitting on -- separator"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 3 Plan 2: Section List Sidebar and Block Editing Summary

**Sortable section list sidebar with @dnd-kit DnD reordering, block picker modal for adding sections, and fully wired visual composer with live preview and debounced git save**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T13:36:18Z
- **Completed:** 2026-02-14T13:39:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- SectionListSidebar renders block instances with drag handles, selection highlight, and hover-reveal delete button
- @dnd-kit sortable reordering with MouseSensor (distance: 8), TouchSensor, KeyboardSensor, and vertical axis constraint
- BlockPicker modal uses @deco/ui Dialog with category grouping, search filter, and block selection
- PageComposer fully wired: section list + block picker + prop editor + live preview via postMessage
- All edits (prop change, reorder, add, delete) debounce-save to git after 2 seconds
- Page editor route simplified to render PageComposer instead of metadata form (net -159 lines)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create section list sidebar with @dnd-kit sortable and block picker** - `bad2c47f8` (feat)
2. **Task 2: Wire composer with section sidebar, prop editing, live preview, and save** - `7662d8f6d` (feat)

## Files Created/Modified
- `client/components/section-list-sidebar.tsx` - Sortable section list with DndContext, SortableContext, drag handles, selection, and delete
- `client/components/block-picker.tsx` - Dialog modal listing available blocks grouped by category with search filter
- `client/components/page-composer.tsx` - Fully wired three-panel composer with SectionListSidebar, BlockPicker, add/delete/reorder handlers, and debounced save
- `client/components/page-editor.tsx` - Simplified to render PageComposer (removed metadata form)
- `package.json` - Added @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/modifiers, @dnd-kit/utilities dependencies

## Decisions Made
- Used @deco/ui Dialog (Radix-based) for the block picker modal, matching the existing pattern in pages-list.tsx
- Created `applyPageUpdate` helper to centralize the "update local state + trigger debounced save" pattern, reducing duplication across delete/reorder/add handlers
- Added query cache invalidation on both debounced auto-save and manual save button for data consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing `sonner` module type error continues across page-composer.tsx and pages-list.tsx (not introduced by this plan, documented in 03-01-SUMMARY.md). page-editor.tsx no longer has this error since it was simplified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Visual editor core is complete: section list sidebar, block picker, prop editing, live preview, and git persistence
- Ready for Plan 03-03 if one exists (overlay injection, advanced block operations)
- BlockInstance add/remove/reorder operations fully tested via DnD and button handlers

## Self-Check: PASSED

All 5 files verified present. Both commit hashes (bad2c47f8, 7662d8f6d) verified in git log. SUMMARY.md exists at expected path.

---
*Phase: 03-visual-editor*
*Completed: 2026-02-14*
