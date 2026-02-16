# Roadmap: deco.cx v2

## Overview

This roadmap delivers a stack-agnostic CMS as a Mesh plugin, progressing from plugin infrastructure through codebase scanning, visual editing, loader management, and publishing. Each phase delivers a complete, verifiable capability: the plugin shell makes pages manageable through MCP-connected local filesystems, the scanner makes components editable, the editor makes editing visual, loaders make data a first-class concern, and publishing makes it production-ready.

## Phases

### v1.0 — Plugin Foundation (Completed)

- [x] **Phase 1: Plugin Shell** - Mesh plugin with site connection, page CRUD, tunnel preview, and git-based storage
- [x] **Phase 2: Block Scanner** - TypeScript schema inference and property editor forms
- [x] **Phase 3: Visual Editor** - Iframe preview with live prop editing and section management
- [x] **Phase 4: Loaders** - Loader editor UI with data source configuration and prop mapping
- [x] **Phase 5: Publishing** - Draft/publish workflow, version history, and starter template

### v1.1 — Polish & Integration

- [ ] **Phase 6: Connection Setup** - Streamlined site connection with inline wizard and auto-detected preview URL
- [ ] **Phase 7: Sections Page** - Scanned blocks listing with detail views and re-scan trigger
- [ ] **Phase 8: Loaders Page** - Loader listing with detail views and binding status
- [ ] **Phase 9: Preview Bridge** - Dead code cleanup and unified iframe communication
- [ ] **Phase 10: Documentation & Validation** - Blocks framework spec and anjo.chat reference validation

## Phase Details

### Phase 1: Plugin Shell
**Goal**: Users can create a Site project in Mesh, connect it to their local codebase via MCP, manage CMS pages, and preview their running dev server -- all through the Mesh admin interface
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):
  1. User can create a Site project in Mesh and configure a connection to the local-fs MCP pointed at their project folder
  2. The site-editor plugin declares a SITE_BINDING (mirroring the object-storage plugin's OBJECT_STORAGE_BINDING pattern) that requires READ_FILE, PUT_FILE, and LIST_FILES capabilities, and all file operations flow through this MCP connection
  3. User can create a new page, see it listed, edit its metadata, and delete it -- with page configs persisted as JSON in `.deco/pages/` via the MCP file operations
  4. User starts their local dev server and the tunnel makes it accessible to Mesh admin, showing the running site in a preview panel
  5. CMS plugin appears in Mesh admin with Pages, Sections, and Loaders in the sidebar navigation
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- SITE_BINDING definition, plugin package skeleton, ServerPlugin + ClientPlugin with sidebar registration
- [x] 01-02-PLAN.md -- Preview panel component and tunnel URL discovery hook
- [x] 01-03-PLAN.md -- Page CRUD server tools (list, get, create, update, delete) and Pages UI

### Phase 2: Block Scanner
**Goal**: The system can scan any TypeScript codebase, discover components, infer their prop schemas, and render editable forms for each component's props
**Depends on**: Phase 1
**Requirements**: BLOCK-01, BLOCK-02, BLOCK-03, BLOCK-04
**Success Criteria** (what must be TRUE):
  1. Running the scanner on a TypeScript project produces block definitions with JSON Schema for each discovered component
  2. User can view auto-generated edit forms for any scanned component's props in the admin sidebar
  3. AI agent can analyze a connected repository and generate `.deco/blocks/` definitions without manual intervention
  4. Manually registered components also produce working edit forms (fallback path)
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md -- ts-morph scanner pipeline, JSON Schema generation, block CRUD server tools, client block API
- [x] 02-02-PLAN.md -- @rjsf property editor forms with custom templates/widgets, sections list UI, block detail view

### Phase 3: Visual Editor
**Goal**: Users can visually edit their site -- selecting sections, editing props, reordering content -- with changes reflected live in a preview
**Depends on**: Phase 2
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EDIT-06, EDIT-07
**Success Criteria** (what must be TRUE):
  1. User sees their running site in an iframe preview panel within the Mesh admin (loaded via the tunnel established in Phase 1)
  2. Clicking a section in the preview opens its property editor; changing a prop value updates the preview within 1 second
  3. User can drag sections to reorder them on a page, and the new order persists to git
  4. User can toggle between mobile, tablet, and desktop preview widths
  5. User can undo and redo prop edits, section reordering, and section add/remove operations
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md -- postMessage protocol, BlockInstance type, three-panel composer layout, viewport toggle, enhanced preview panel
- [x] 03-02-PLAN.md -- Section list sidebar with @dnd-kit sortable, block picker, prop editing wired to live preview, save-to-git
- [x] 03-03-PLAN.md -- Snapshot-based undo/redo hook with keyboard shortcuts and toolbar integration

### Phase 4: Loaders
**Goal**: Users can manage data loaders as first-class entities -- configuring data sources, parameters, and mapping loader output to section props
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  1. Loaders panel is accessible from the main sidebar navigation with equal prominence to Sections
  2. User can create a loader, configure its data source and parameters, and map its output to section props
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md -- Loader types, scanner extension, server tools (SCAN/LIST/GET), client API, query keys
- [x] 04-02-PLAN.md -- Loaders list/detail UI, loader picker modal, prop binding integration in page composer

### Phase 5: Publishing
**Goal**: Users can go from editing to production -- previewing drafts, publishing changes, reverting mistakes, and scaffolding new projects
**Depends on**: Phase 3, Phase 4
**Requirements**: PUB-01, PUB-02, PUB-03
**Success Criteria** (what must be TRUE):
  1. User can work on a draft branch, preview changes, and merge to main to publish
  2. User can view commit history per page with diffs and revert to any previous version with one click
  3. User can create a new project from the default template (React 19 + Vite + Tailwind + shadcn) with working example sections, loaders, and `.deco/` scaffolding
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md -- Extend SITE_BINDING with branch tools, draft/publish workflow UI (branch switcher + publish bar)
- [x] 05-02-PLAN.md -- Extend SITE_BINDING with history tools, page version history panel with diff view and one-click revert
- [x] 05-03-PLAN.md -- Default starter template with React 19 + Vite + Tailwind + shadcn + .deco/ scaffolding

### Phase 6: Connection Setup
**Goal**: Users can connect their local project to Mesh site-editor from within the plugin UI, with preview URL auto-detected
**Depends on**: Phase 1 (extends connection UX)
**Requirements**: CONN-01, CONN-02
**Success Criteria** (what must be TRUE):
  1. User can connect their local project folder from the plugin's empty state via an inline wizard with path input, without being redirected to project settings
  2. Plugin auto-detects the site's running dev server tunnel URL and configures the preview panel without manual URL entry
  3. Connection wizard validates the selected path contains a valid TypeScript project before completing setup
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md -- FILESYSTEM_VALIDATE_PROJECT tool, empty state validation + success confirmation
- [ ] 06-02-PLAN.md -- FILESYSTEM_READ_TUNNEL_CONFIG tool, tunnel auto-detection hook, instructions UI

### Phase 7: Sections Page
**Goal**: Users can browse all scanned blocks, view details, and trigger re-scans to refresh the block registry
**Depends on**: Phase 2 (requires block scanner)
**Requirements**: SECT-01, SECT-02, SECT-03
**Success Criteria** (what must be TRUE):
  1. User can view a list of all scanned blocks from `.deco/blocks/` showing name, category, and component path for each block
  2. User can navigate to a block detail view that displays the block's JSON Schema, default props, and a live property editor form preview
  3. User can trigger a codebase re-scan from the sections page UI, which regenerates `.deco/blocks/` and updates the block list
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md -- Sections list refactored to table-rows layout with collapsible categories and working scan trigger
- [ ] 07-02-PLAN.md -- Block detail two-column layout with collapsible schema tree and live prop editor

### Phase 8: Loaders Page
**Goal**: Users can browse all loaders, view configuration details, and understand binding relationships
**Depends on**: Phase 4 (requires loader scanner)
**Requirements**: LOAD-01, LOAD-02
**Success Criteria** (what must be TRUE):
  1. User can view a list of all loaders from `.deco/loaders/` showing name, data source type, and binding status (which sections consume this loader)
  2. User can navigate to a loader detail view showing its configuration, parameters, output schema, and a list of sections that bind to this loader
**Plans**: 1 plan

Plans:
- [ ] 08-01-PLAN.md -- Loaders list page with loader table, loader detail view with config viewer and binding status

### Phase 9: Preview Bridge
**Goal**: Unified iframe communication with dead code removed, enabling reliable click-to-select and live prop editing
**Depends on**: Phase 3 (refactors visual editor)
**Requirements**: PREV-01, PREV-02, PREV-03
**Success Criteria** (what must be TRUE):
  1. Composer's unused `iframeRef` and `useEditorMessages` are removed; all iframe communication flows through PreviewPanel's `useIframeBridge`
  2. User can click a section in the iframe preview to select it, which opens the property editor in the sidebar
  3. Prop changes made in the editor reflect in the iframe preview within 1 second via the postMessage protocol
**Plans**: 2 plans

Plans:
- [ ] 09-01-PLAN.md -- Remove dead code (composer iframeRef, useEditorMessages), consolidate all iframe comms in PreviewPanel
- [ ] 09-02-PLAN.md -- Wire click-to-select in iframe to sidebar prop editor, verify live prop editing end-to-end

### Phase 10: Documentation & Validation
**Goal**: Blocks framework is fully documented for AI agents, and anjo.chat proves the full integration works
**Depends on**: Phases 6, 7, 8, 9 (requires all integration work complete)
**Requirements**: SPEC-01, VAL-01
**Success Criteria** (what must be TRUE):
  1. An agent-readable skill document exists that explains `.deco/` directory conventions, block definition format, `data-block-id` attributes, postMessage protocol, and `initEditorBridge()` integration -- sufficient for any AI agent to make a site deco-compatible
  2. anjo.chat demonstrates full end-to-end functionality: connection setup, sections listing showing actual scanned blocks, loader listing showing actual loaders, live preview rendering anjo.chat pages, click-to-select working on anjo.chat sections, and prop editing updating the live preview
**Plans**: 2 plans

Plans:
- [ ] 10-01-PLAN.md -- Write BLOCKS_FRAMEWORK.md with complete conventions, schemas, and integration guide
- [ ] 10-02-PLAN.md -- Validate anjo.chat end-to-end: connection, sections, loaders, preview, click-to-select, prop editing

## Progress

**Execution Order:**
v1.0 phases (1-5) complete. v1.1 phases execute in order: 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Shell | 3/3 | Complete | 2026-02-14 |
| 2. Block Scanner | 2/2 | Complete | 2026-02-14 |
| 3. Visual Editor | 3/3 | Complete | 2026-02-14 |
| 4. Loaders | 2/2 | Complete | 2026-02-14 |
| 5. Publishing | 3/3 | Complete | 2026-02-14 |
| 6. Connection Setup | 0/2 | Pending | — |
| 7. Sections Page | 0/2 | Pending | — |
| 8. Loaders Page | 0/1 | Pending | — |
| 9. Preview Bridge | 0/2 | Pending | — |
| 10. Documentation & Validation | 0/2 | Pending | — |
