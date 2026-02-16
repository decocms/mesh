# Phase 9: Preview Bridge - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate iframe communication into a single reliable path (useIframeBridge in PreviewPanel), remove all dead code, and make click-to-select + live prop editing work end-to-end. Includes adding edit/interact mode toggle for the preview.

</domain>

<decisions>
## Implementation Decisions

### Click-to-select interaction
- Hover state: semi-transparent colored overlay on the section area (not outline border)
- Selected state: no persistent visual in the preview — the sidebar prop editor opening is the indication
- Nested sections: always select the innermost (deepest) section under the cursor
- Click-away deselects: clicking outside any section closes the prop editor and clears selection

### Edit/Interact mode toggle
- A toggle next to the preview URL bar with a cursor icon switches between edit mode and interact mode
- **Edit mode (default):** clicks select sections for editing
- **Interact mode:** clicks work normally (links, buttons, etc.)
- Internal page navigation in interact mode: auto-switch the page editor silently (update URL bar + load that page's sections)
- External link navigation: allow it, disable the editor, provide a way to go back

### Live editing feedback
- Instant hot-swap: send new props immediately via postMessage, preview re-renders in place with no transition
- No visual indicator during prop application — the visual change itself is the feedback
- Discard prop edits during iframe navigation — user re-edits after the new page loads
- Trust live state on save — no full page reload to confirm persisted data

### Error & edge states
- Iframe disconnect (dev server crash): dim the preview with an overlay message + manual reconnect button
- Section render error after prop change: show the error in-place where the section would be
- Navigation detection handles internal vs external links differently (see edit/interact mode above)

### Dead code cleanup
- Audit and clean: don't just remove known dead refs — audit all iframe-related code across the composer for anything unused
- Consolidate duplicates: merge any duplicate iframe communication paths into the single useIframeBridge source of truth
- Formalize postMessage protocol: create a shared typed message union that both admin and iframe client use
- Protocol types live in the plugin package (mesh-plugin-site-editor)

### Claude's Discretion
- Exact overlay color and opacity for hover state
- Cursor icon design for the edit/interact toggle
- Reconnect retry strategy for iframe disconnect
- Error display format for failed section renders

</decisions>

<specifics>
## Specific Ideas

- Edit/interact toggle should feel like Figma's hand tool vs selection tool — a clear mode switch next to the URL bar
- The cursor icon on the toggle should visually communicate the mode (pointer for edit, hand for interact)
- Internal link navigation in interact mode should feel seamless — the editor follows where the user goes in the preview

</specifics>

<deferred>
## Deferred Ideas

- **Agent onboarding skill**: A skill (living in the plugin package) that an agent can execute to add CMS/blocks framework support to any existing codebase — making any vibecoded site compatible with the visual editor. This goes beyond documentation (Phase 10's BLOCKS_FRAMEWORK.md) into an actionable, executable skill. Should be scoped into Phase 10 or a follow-up phase.

</deferred>

---

*Phase: 09-preview-bridge*
*Context gathered: 2026-02-16*
