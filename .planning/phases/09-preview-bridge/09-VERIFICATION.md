---
phase: 09-preview-bridge
verified: 2026-02-16T19:23:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Click a section in the iframe preview to select it"
    expected: "The prop editor opens in the right sidebar showing that section's properties"
    why_human: "Visual interaction requires testing in running app"
  - test: "Click outside any section in the preview"
    expected: "The selection clears and prop editor shows 'Select a section to edit'"
    why_human: "Visual interaction requires testing in running app"
  - test: "Toggle from edit to interact mode"
    expected: "Clicks pass through to the site normally; links navigate, buttons work"
    why_human: "Mode behavior and click passthrough requires testing in running app"
  - test: "Toggle back to edit mode"
    expected: "Clicks now select sections again instead of activating links/buttons"
    why_human: "Mode behavior requires testing in running app"
  - test: "Change a prop value in the editor"
    expected: "The iframe preview updates within 1 second to reflect the new prop value"
    why_human: "Live preview timing and visual update requires testing in running app"
  - test: "Stop the dev server while the iframe is connected"
    expected: "After 5 seconds, a dimmed overlay appears with 'Preview disconnected' message and reconnect button"
    why_human: "Disconnect timing and overlay appearance requires testing in running app"
  - test: "Click reconnect button"
    expected: "The iframe reloads and attempts to reconnect to the dev server"
    why_human: "Reconnect behavior requires testing in running app"
  - test: "In interact mode, click a link to an external site"
    expected: "The iframe navigates to the external site, a dimmed overlay appears with the external URL and 'Return to editor' button, the right panel is disabled"
    why_human: "External navigation detection and overlay requires testing in running app"
  - test: "Click 'Return to editor' from external navigation"
    expected: "The iframe reloads to the original site, the overlay disappears, the editor is re-enabled"
    why_human: "Return flow requires testing in running app"
---

# Phase 9: Preview Bridge Verification Report

**Phase Goal:** Unified iframe communication with dead code removed, enabling reliable click-to-select and live prop editing

**Verified:** 2026-02-16T19:23:00Z

**Status:** human_needed

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can click a section in the iframe preview to select it, opening the prop editor in the sidebar | ✓ VERIFIED | `page-composer.tsx:150` wires `onBlockClicked: setSelectedBlockId` to bridge; `editor-client.ts:76-98` sends `deco:block-clicked` on click; `page-composer.tsx:172` finds selected block; `page-composer.tsx:576-586` renders PropEditor when selectedBlock exists |
| 2 | Clicking outside any section in the preview deselects and closes the prop editor | ✓ VERIFIED | `page-composer.tsx:151` wires `onClickAway: () => setSelectedBlockId(null)` to bridge; `editor-client.ts:95-97` sends `deco:click-away` when no section found; `page-composer.tsx:650-655` shows "Select a section to edit" when no selection |
| 3 | Edit/interact mode toggle is visible next to the viewport controls | ✓ VERIFIED | `mode-toggle.tsx:16-39` implements toggle component with MousePointer2/Hand icons; `preview-panel.tsx:20,135` imports and renders ModeToggle in toolbar; `preview-panel.tsx:128-136` shows toolbar with URL and mode toggle |
| 4 | In interact mode, clicks pass through to the site normally | ✓ VERIFIED | `editor-client.ts:33,76,150` manages mode state; `editor-client.ts:215-227` handles `deco:set-mode` and teardown/setup; `editor-client.ts:150-176` setupInteractMode removes edit click handler |
| 5 | Iframe disconnect shows a dimmed overlay with reconnect button | ✓ VERIFIED | `use-iframe-bridge.ts:24-27` defines state machine (0=loading, 1=ready, 2=disconnected); `use-iframe-bridge.ts:186-205` starts 5s disconnect timer on iframe load; `preview-panel.tsx:164-175` renders disconnect overlay when `disconnected && !externalNav` |
| 6 | Prop changes in the editor reflect in the iframe preview within 1 second | ✓ VERIFIED | `page-composer.tsx:250-269` handlePropChange sends `deco:update-block` immediately; `editor-client.ts:203-213` receives and updates currentPageState; `editor-client.ts:296-314` useEditorProps returns updated props; section re-renders with new props |
| 7 | External link navigation in interact mode disables the editor and shows a way to go back | ✓ VERIFIED | `page-composer.tsx:65,152-156` manages externalNav state; `editor-client.ts:150-176` detects external navigation; `preview-panel.tsx:150-161` renders external nav overlay; `page-composer.tsx:572` disables right panel with `opacity-50 pointer-events-none` when externalNav set |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mesh-plugin-site-editor/client/components/mode-toggle.tsx` | Edit/interact mode toggle component | ✓ VERIFIED | 39 lines, exports ModeToggle, contains MousePointer2 and Hand icons from lucide-react, wired in PreviewPanel |
| `packages/mesh-plugin-site-editor/client/components/preview-panel.tsx` | Preview panel with mode toggle, disconnect overlay, mode messaging | ✓ VERIFIED | 182 lines, renders ModeToggle in toolbar (line 135), disconnect overlay (lines 164-175), external nav overlay (lines 150-161), no stub patterns |
| `packages/mesh-plugin-site-editor/client/lib/use-iframe-bridge.ts` | Consolidated bridge with state machine, disconnect detection, mode handling | ✓ VERIFIED | 217 lines, implements numeric state machine (lines 24-27), disconnect timer (lines 186-205), sends deco:set-mode on ready (line 141), handles all protocol messages, exports ready/disconnected/reconnect |
| `packages/mesh-plugin-site-editor/client/components/page-composer.tsx` | Mode state, external nav state, wiring to bridge and PreviewPanel | ✓ VERIFIED | 679 lines, manages mode state (line 64), externalNav state (line 65), wires useIframeBridge (lines 145-157), passes all props to PreviewPanel (lines 556-567), disables right panel on external nav (line 572) |
| `packages/starter-template/app/lib/editor-client.ts` | Site-side client handling protocol and live updates | ✓ VERIFIED | 315 lines, handles deco:ready handshake (line 253), deco:page-config (lines 197-200), deco:update-block (lines 203-213), deco:set-mode (lines 215-227), sends deco:block-clicked (lines 76-98), sends deco:click-away (line 96), exports useEditorProps for live prop updates (lines 296-314) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| page-composer.tsx | use-iframe-bridge.ts | onBlockClicked callback wires deco:block-clicked to setSelectedBlockId | ✓ WIRED | Line 150: `onBlockClicked: setSelectedBlockId` — direct function reference passed to bridge options |
| page-composer.tsx | use-iframe-bridge.ts | onClickAway callback wires deco:click-away to clearing selectedBlockId | ✓ WIRED | Line 151: `onClickAway: () => setSelectedBlockId(null)` — arrow function clears selection |
| preview-panel.tsx | mode-toggle.tsx | ModeToggle renders in preview toolbar, onChange sends deco:set-mode | ✓ WIRED | Line 20 imports ModeToggle, line 135 renders it with mode prop and onModeChange callback; page-composer.tsx line 160-163 handleModeChange sends deco:set-mode via bridge |
| page-composer.tsx | editor-client.ts | handlePropChange -> send(deco:update-block) -> editor-client updates currentPageState -> useEditorProps returns new value -> section re-renders | ✓ WIRED | Line 262 sends `deco:update-block` immediately on prop change; editor-client.ts lines 203-213 updates currentPageState; lines 296-314 useEditorProps hook returns updated props from currentPageState; React re-renders section with new props |

All key links verified. The full flow from user interaction to live preview is wired end-to-end.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| preview-panel.tsx | 98 | Input placeholder text | ℹ️ Info | Not a code stub, just UI placeholder text for input field |

No blocking anti-patterns found. The only "placeholder" found is a legitimate input placeholder attribute for the preview URL input field.

### Human Verification Required

#### 1. Click-to-select interaction
**Test:** Start the dev server and Mesh editor. Load a page in the page composer. Click on different sections in the iframe preview.
**Expected:** Each click on a section should select it (visible in the left sidebar) and open the prop editor in the right sidebar showing that section's properties. Clicking outside any section should deselect and show "Select a section to edit".
**Why human:** Visual interaction and sidebar state changes require testing in the running app.

#### 2. Mode toggle behavior
**Test:** Toggle from edit mode to interact mode using the toggle button in the preview toolbar. Click on links and buttons in the preview.
**Expected:** In interact mode, clicks should pass through to the site normally — links should navigate, buttons should activate. Toggle back to edit mode and verify clicks now select sections instead.
**Why human:** Mode behavior and click passthrough require testing in the running app.

#### 3. Live prop editing
**Test:** Select a section, change a prop value in the right panel editor (e.g., change text, toggle a boolean, update a number).
**Expected:** The iframe preview should update within 1 second to reflect the new prop value without a full page reload.
**Why human:** Live preview timing and visual updates require testing in the running app.

#### 4. Disconnect detection and recovery
**Test:** With the iframe connected, stop the dev server (Ctrl+C in terminal). Wait 5 seconds. Then restart the dev server and click the reconnect button.
**Expected:** After 5 seconds without response, a dimmed overlay should appear over the preview with "Preview disconnected" message and a "Reconnect" button. Clicking reconnect should reload the iframe and re-establish the connection.
**Why human:** Disconnect timing and overlay appearance require testing in the running app.

#### 5. External navigation handling
**Test:** Toggle to interact mode. Click a link in the preview that points to an external site (e.g., a link to google.com or another domain).
**Expected:** The iframe should navigate to the external site. A dimmed overlay should appear showing the external URL and a "Return to editor" button. The right panel should be visually disabled (dimmed, pointer-events disabled). Clicking "Return to editor" should reload the original site and re-enable the editor.
**Why human:** External navigation detection, overlay display, and return flow require testing in the running app.

### Code Quality

- ✓ No TODO/FIXME/HACK comments in modified files
- ✓ No console.log-only implementations
- ✓ No empty return statements or stub handlers
- ✓ All functions have substantive implementations
- ✓ TypeScript types are properly defined
- ✓ React 19 patterns followed (no useEffect, no manual memoization)
- ✓ useSyncExternalStore used for external state subscription (window message events)
- ✓ Numeric state machine pattern for stable snapshots in useSyncExternalStore

### Commits

Both task commits exist and are documented in SUMMARY.md:

1. **feat(09-02): add edit/interact mode toggle, click-to-select wiring, and external nav handling** - `2d95d9237`
   - Created ModeToggle component
   - Added URL toolbar and mode toggle to PreviewPanel
   - Wired mode state in PageComposer
   - Added external navigation handling with overlay
   - 3 files changed, 154 insertions, 16 deletions

2. **feat(09-02): add iframe disconnect detection with reconnect overlay** - `4270b5579`
   - Replaced boolean readyRef with numeric state machine
   - Added 5-second disconnect timer
   - Implemented reconnect function
   - 1 file changed, 78 insertions, 17 deletions

### Architecture Patterns

#### Numeric State Machine Pattern
The bridge uses a numeric state machine (0=loading, 1=ready, 2=disconnected) instead of multiple boolean refs. This provides stable snapshot identity for `useSyncExternalStore` and prevents object comparison issues:

```typescript
// use-iframe-bridge.ts:24-27
const LOADING = 0;
const READY = 1;
const DISCONNECTED = 2;
```

#### notifyRef Pattern
Stores the `useSyncExternalStore` notify callback in a ref so external triggers (timers, event handlers) can force re-renders from outside the subscribe callback:

```typescript
// use-iframe-bridge.ts:75,121,200,204
const notifyRef = useRef<(() => void) | null>(null);
// Inside subscribe:
notifyRef.current = notify;
// In timer callback:
notifyRef.current?.();
```

This pattern is now documented in SUMMARY.md as a reusable pattern for other components.

---

## Verification Summary

**All 7 truths verified** through code inspection:
1. ✓ Click-to-select wiring complete
2. ✓ Click-away deselect wiring complete
3. ✓ Mode toggle component exists and renders
4. ✓ Interact mode click passthrough implemented
5. ✓ Disconnect detection with 5s timeout and reconnect overlay
6. ✓ Live prop editing flow end-to-end (handlePropChange → deco:update-block → currentPageState → useEditorProps → re-render)
7. ✓ External navigation detection, overlay, and return button

**All 5 artifacts verified** at all three levels:
- Level 1 (Exists): ✓ All files present
- Level 2 (Substantive): ✓ All files have full implementations, no stubs
- Level 3 (Wired): ✓ All files imported and used correctly

**All 4 key links verified** as WIRED:
- onBlockClicked → setSelectedBlockId
- onClickAway → clear selection
- ModeToggle → deco:set-mode
- handlePropChange → deco:update-block → useEditorProps → re-render

**No blocking anti-patterns found.**

**9 human verification items identified** for visual/interactive behavior testing.

The codebase fully implements the phase goal. All automated checks pass. The phase is ready for human verification to confirm the interactive behavior works as expected in the running application.

---

_Verified: 2026-02-16T19:23:00Z_
_Verifier: Claude (gsd-verifier)_
