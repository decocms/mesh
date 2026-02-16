# Phase 6: Connection Setup - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Inline wizard for connecting a local project to the Mesh site-editor plugin, with auto-detected preview URL. Users connect from within the plugin UI (no redirect to project settings). Tunnel auto-detection eliminates manual URL entry. This extends the Phase 1 connection UX — no new capabilities beyond connection setup and preview URL configuration.

</domain>

<decisions>
## Implementation Decisions

### Wizard flow & steps
- Single-page wizard — all inputs on one screen (path input, validation, connect button)
- Only input required: project folder path (everything else auto-detected)
- Path input includes a text field with browse button (file browser if platform supports)
- After clicking Connect: brief success confirmation (checkmark/message) before transitioning to the plugin pages view

### Validation & error feedback
- Validation runs on Connect button click (not on blur/typing)
- Valid project requires both `tsconfig.json` and `package.json` in the specified path
- Errors appear inline under the path input field (red text)
- Distinct error messages for different failures:
  - "Path not found" — directory doesn't exist
  - "Not a TypeScript project (missing tsconfig.json)" — no tsconfig
  - "Not a Node project (missing package.json)" — no package.json

### Auto-detection behavior
- Tunnel detection starts after connection is created (not during wizard)
- If no tunnel detected: show instructions to run `deco link` with guidance
- Background auto-poll for tunnel URL after showing instructions — once detected, preview auto-configures
- Detected tunnel URL persists in project config for reuse across sessions

### Empty state design
- Friendly & guiding tone: "Connect your project to start editing" style copy
- Visual: relevant icon (folder/plug) with 1-2 lines explaining what connecting does
- Wizard appears centered in the main content area (card/form where pages would normally show)
- All plugin sidebar routes (Pages, Sections, Loaders) show the same connection wizard if not connected — consistent experience

### Claude's Discretion
- Specific icon choice for empty state
- Browse button implementation (native file picker vs. text-only fallback in web context)
- Auto-poll interval and timeout for tunnel detection
- Success confirmation animation/duration
- Exact copy/wording for all UI text

</decisions>

<specifics>
## Specific Ideas

- When tunnel isn't detected, the plugin should actively help the user run `deco link` — not just say "URL not found" but show actionable instructions
- Connection wizard should feel like part of the plugin, not a settings page — centered card in the content area, not a redirect

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-connection-setup*
*Context gathered: 2026-02-15*
