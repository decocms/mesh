# Phase 8: Loaders Page - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade the existing loaders list and detail views to match the quality of Phase 7's sections page. Users can browse all loaders with a table layout, view configuration details in a two-column detail view, see which sections consume each loader, and trigger re-scans. No new tools or server-side changes — this is a client UI upgrade using existing loader API and scan tools.

</domain>

<decisions>
## Implementation Decisions

### List layout & columns
- Table-row layout with collapsible categories, matching Phase 7 sections pattern exactly
- Four columns: Name, Source, Sections, Params
- "Sections" column shows first 2 connected section names inline + "+N more" truncation
- When a loader has zero connected sections, show muted gray text "No sections"
- Avoid the word "bindings" — use "Sections" as column header for the loader-to-section relationship

### Detail view structure
- Two-column layout matching block detail pattern from Phase 7
- Left column: output schema tree (what the loader returns) using existing SchemaTree component as-is
- Right column: input parameters editor (PropEditor form, display only — no execution)
- Connected sections shown as badge count in the metadata bar area (expandable on click), not a dedicated section
- Breadcrumb: Loaders / {LoaderName}, same pattern as Sections / {BlockName}

### Scan trigger & states
- Re-scan button calls the same CMS_BLOCK_SCAN tool (one scan for both blocks and loaders)
- Called via selfClient (SELF_MCP_ALIAS_ID), same pattern as sections page
- Button shows spinner during scan, success toast when complete
- Auto-refresh after scan: invalidate React Query cache so list updates automatically
- Empty state matches sections: icon + "No loaders found" + "Scan Codebase" button

### Consistency with Sections
- Mirror Phase 7 patterns exactly: table-rows, collapsible categories, two-column detail, schema tree
- Same selfClient tool call pattern for scan
- Same breadcrumb navigation pattern
- Key difference from blocks: loaders have both input schema (parameters) and output schema (returned data), split across the two columns (output left, input right)

### Claude's Discretion
- Exact metadata badges and info bar content for loader detail
- How to compute connected sections (cross-reference page configs with loader references)
- Loading skeleton and error state details

</decisions>

<specifics>
## Specific Ideas

- The loader list should feel identical to the sections list — users should recognize the same UI patterns
- "Sections" column with inline names gives quick context about loader usage without clicking into detail

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-loaders-page*
*Context gathered: 2026-02-16*
