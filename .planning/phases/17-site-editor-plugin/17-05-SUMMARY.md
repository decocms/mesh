---
phase: 17-site-editor-plugin
plan: 05
subsystem: ui
tags: [react, plugin, rjsf, dnd-kit, iframe, undo-redo, tanstack-query]

# Dependency graph
requires:
  - phase: 17-site-editor-plugin
    plan: 02
    provides: page-api.ts (BlockInstance, Page types, getPage/updatePage), block-api.ts (listBlocks/listLoaders), query-keys.ts
  - phase: 17-site-editor-plugin
    plan: 03
    provides: useUndoRedo, useIframeBridge hooks
  - phase: 17-site-editor-plugin
    plan: 04
    provides: page-composer.tsx stub, router.ts wiring
provides:
  - packages/mesh-plugin-site-editor/client/components/page-composer.tsx (full two-panel visual composer replacing stub)
  - packages/mesh-plugin-site-editor/client/components/section-list-sidebar.tsx (DnD sortable section list)
  - packages/mesh-plugin-site-editor/client/components/prop-editor.tsx (RJSF form for section props)
  - packages/mesh-plugin-site-editor/client/components/preview-panel.tsx (iframe with edit/interact toggle)
  - packages/mesh-plugin-site-editor/client/components/block-picker.tsx (block selection modal)
  - packages/mesh-plugin-site-editor/client/components/loader-drawer.tsx (loader binding overlay drawer)
  - packages/mesh-plugin-site-editor/client/components/rjsf/widgets.tsx (custom RJSF widgets)
  - packages/mesh-plugin-site-editor/client/components/rjsf/templates.tsx (custom RJSF templates)
affects: [17-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level keyboard store pattern: _undoFn/_redoFn module-level refs wired during render, kbStore singleton with useSyncExternalStore — avoids useEffect for keyboard shortcuts"
    - "CSS slide navigation: absolute inset-0 panels with translate-x-full/-translate-x-full toggled by selectedBlock state — no library required"
    - "DnD sortable sections: DndContext + SortableContext + useSortable from @dnd-kit with restrictToVerticalAxis modifier"
    - "RJSF custom widgets: RegistryWidgetsType with TextWidget, NumberWidget, CheckboxWidget, URLWidget using @deco/ui Input/Checkbox/Label"
    - "@deco/ui imports require .tsx extension — bundler moduleResolution pattern (consistent with other plugins)"

key-files:
  created:
    - packages/mesh-plugin-site-editor/client/components/page-composer.tsx
    - packages/mesh-plugin-site-editor/client/components/section-list-sidebar.tsx
    - packages/mesh-plugin-site-editor/client/components/prop-editor.tsx
    - packages/mesh-plugin-site-editor/client/components/preview-panel.tsx
    - packages/mesh-plugin-site-editor/client/components/block-picker.tsx
    - packages/mesh-plugin-site-editor/client/components/loader-drawer.tsx
    - packages/mesh-plugin-site-editor/client/components/rjsf/widgets.tsx
    - packages/mesh-plugin-site-editor/client/components/rjsf/templates.tsx
  modified: []

key-decisions:
  - "Module-level keyboard handler pattern: _undoFn/_redoFn set during render, singleton kbStore with useSyncExternalStore — avoids useEffect ban while enabling Cmd+Z/Cmd+Shift+Z"
  - "typedCaller cast: toolCaller from usePluginContext<typeof DECO_BLOCKS_BINDING>() is cast to TypedToolCaller<DecoBlocksBinding> for block-picker/loader-drawer, and to GenericToolCaller for page-api filesystem calls"
  - "resetTrackerRef inline pattern: ref-based { current: '' } object created inline in render body to detect pageId changes and call reset() — avoids useEffect for initial page load"

requirements-completed: [EDT-03, EDT-04, EDT-05, EDT-06, EDT-07, EDT-08, EDT-09, EDT-10]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 17 Plan 05: Visual Composer Components Summary

**Two-panel visual composer with DnD section reordering, RJSF prop forms, slide navigation, iframe preview with mode toggle, block picker modal, loader binding drawer, and Cmd+Z/Cmd+Shift+Z undo/redo**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-21T19:23:35Z
- **Completed:** 2026-02-21T19:26:34Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Built full `page-composer.tsx` replacing the plan 17-04 stub — two-panel layout with slide navigation, undo/redo, save mutation, DnD integration, RJSF forms, iframe bridge, block picker, and loader drawer all wired together
- Implemented `section-list-sidebar.tsx` with @dnd-kit DndContext + SortableContext + useSortable, vertical axis constraint, drag handle, and delete button with hover-reveal
- Created custom RJSF widgets (text, number, checkbox, url) and field/description templates for clean @deco/ui-consistent form UI
- `preview-panel.tsx` — iframe with pointer-events controlled by mode prop ("edit" = blocked by overlay, "interact" = auto); graceful empty state when previewUrl is absent
- `block-picker.tsx` and `loader-drawer.tsx` — modal and overlay drawer for adding sections and binding loaders, both fetching via TanStack Query with QUERY_KEYS
- Keyboard shortcuts (Cmd+Z / Cmd+Shift+Z) via module-level singleton store + useSyncExternalStore — zero useEffect across all 8 new files

## Task Commits

Each task was committed atomically:

1. **Task 1: RJSF widgets, templates, prop-editor, block-picker, loader-drawer** - `a4226a7ff` (feat)
2. **Task 2: Section list with DnD, preview panel, and main page-composer** - `d28c4de87` (feat)

## Files Created/Modified

- `packages/mesh-plugin-site-editor/client/components/page-composer.tsx` - Full two-panel composer with slide nav, undo/redo, save, all sub-components wired
- `packages/mesh-plugin-site-editor/client/components/section-list-sidebar.tsx` - DnD sortable sections list with add/remove/select
- `packages/mesh-plugin-site-editor/client/components/prop-editor.tsx` - RJSF form for editing section props, back button, loader binding trigger
- `packages/mesh-plugin-site-editor/client/components/preview-panel.tsx` - iframe with edit/interact toggle and graceful empty state
- `packages/mesh-plugin-site-editor/client/components/block-picker.tsx` - Modal showing available blocks for adding to page
- `packages/mesh-plugin-site-editor/client/components/loader-drawer.tsx` - Drawer for selecting and binding a loader to a prop
- `packages/mesh-plugin-site-editor/client/components/rjsf/widgets.tsx` - Custom RJSF widgets: text, number, checkbox, url
- `packages/mesh-plugin-site-editor/client/components/rjsf/templates.tsx` - Custom FieldTemplate and DescriptionField

## Decisions Made

- **Module-level keyboard handler**: `_undoFn`/`_redoFn` are module-level variables set during render, with a singleton `kbStore` that installs the window `keydown` listener once. `useSyncExternalStore(kbStore.subscribe, ...)` subscribes without useEffect.
- **typedCaller cast pattern**: `toolCaller` from `usePluginContext<typeof DECO_BLOCKS_BINDING>()` typed as `TypedToolCaller<typeof DECO_BLOCKS_BINDING>` — cast to `TypedToolCaller<DecoBlocksBinding>` (type alias) for block-picker/loader-drawer, and to `GenericToolCaller` for filesystem calls.
- **resetTrackerRef inline**: `{ current: '' }` created inline in render body; checks `pageId !== current` then calls `reset(page.blocks)` — avoids useEffect for initial data sync.

## Deviations from Plan

None — plan executed exactly as written. The keyboard shortcut implementation used a module-level singleton pattern (slightly different from the plan's inline subscribe pattern) to satisfy the useEffect ban while keeping the same external behavior.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- All 8 composer component files compile cleanly (TypeScript: 0 errors)
- `page-composer.tsx` fully replaces the plan 17-04 stub — router lazy import resolves correctly
- Plan 17-06 (git UX footer) can import page-composer and add the footer bar without conflict
- No blockers for plan 17-06

## Self-Check: PASSED

- FOUND: packages/mesh-plugin-site-editor/client/components/page-composer.tsx
- FOUND: packages/mesh-plugin-site-editor/client/components/section-list-sidebar.tsx
- FOUND: packages/mesh-plugin-site-editor/client/components/prop-editor.tsx
- FOUND: packages/mesh-plugin-site-editor/client/components/preview-panel.tsx
- FOUND: packages/mesh-plugin-site-editor/client/components/block-picker.tsx
- FOUND: packages/mesh-plugin-site-editor/client/components/loader-drawer.tsx
- FOUND: packages/mesh-plugin-site-editor/client/components/rjsf/widgets.tsx
- FOUND: packages/mesh-plugin-site-editor/client/components/rjsf/templates.tsx
- FOUND commit: a4226a7ff (Task 1)
- FOUND commit: d28c4de87 (Task 2)

---
*Phase: 17-site-editor-plugin*
*Completed: 2026-02-21*
