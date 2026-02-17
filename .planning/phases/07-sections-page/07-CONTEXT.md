# Phase 7: Sections Page - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Browse all scanned blocks from `.deco/blocks/`, view block details with schema and form preview, and trigger re-scans to refresh the block registry. This phase builds the actual list/detail views for the Sections sidebar item that was scaffolded in Phase 1.

</domain>

<decisions>
## Implementation Decisions

### Block list presentation
- Table rows layout — dense, scannable, data-rich
- Grouped by category (collapsible sections per category, e.g., sections, headers, footers)
- Columns: block name, category tag, component file path
- Clicking a row navigates to a separate detail page (`/sections/:blockId`)

### Block detail view
- Two-column layout: collapsible schema tree on the left, live property editor form on the right
- Schema displayed as interactive collapsible tree (expand/collapse nested properties)
- Form preview pre-filled with default prop values from the block definition
- Component file path shown as plain text (no clickable link)

### Empty & edge states
- No blocks scanned: show message + prominent "Scan Codebase" button (scan prompt, not instructions)
- Require active connection before showing scan state — if no connection, show "Connect your project first"
- Malformed schema: fall back to raw JSON with syntax highlighting + error note (still useful for debugging)
- After re-scan, removed blocks disappear silently — re-scan replaces the list entirely

### Claude's Discretion
- Re-scan trigger placement and progress feedback UI
- Exact table styling and category collapse behavior
- Schema tree component implementation
- Loading states during scan and data fetch

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-sections-page*
*Context gathered: 2026-02-15*
