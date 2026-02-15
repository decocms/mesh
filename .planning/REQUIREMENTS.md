# Requirements: deco.cx v2

**Defined:** 2026-02-14
**Core Value:** Any TypeScript site gets a production-grade CMS with visual editing and resilient data in minutes

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Plugin Foundation

- [ ] **FOUND-01**: Mesh plugin skeleton with ClientPlugin + ServerPlugin wiring, registered in Mesh plugin registry
- [ ] **FOUND-02**: Page CRUD -- create, read, update, delete pages via MCP server tools with Zod schemas
- [ ] **FOUND-03**: Git-based storage -- page configs stored as JSON in `.deco/pages/` via deconfig MCP tools
- [ ] **FOUND-04**: Sidebar navigation -- Pages, Sections, Loaders as primary nav items in Mesh admin
- [ ] **FOUND-05**: Site connection via local-fs MCP -- user creates a Site project in Mesh, configures a connection to local-fs MCP pointed at their project folder; the site-editor plugin declares a SITE_BINDING requiring READ_FILE, PUT_FILE, LIST_FILES; all file operations (reading components, writing `.deco/` config, scanning) go through this MCP connection
- [ ] **FOUND-06**: Tunnel setup for local preview -- user starts their dev server locally, tunnel makes it accessible to the Mesh admin so the site can be previewed in an iframe

### Block System

- [ ] **BLOCK-01**: TypeScript schema inference -- ts-morph scans codebase, extracts component exports with typed props, generates block definitions
- [ ] **BLOCK-02**: JSON Schema generation from TypeScript types via ts-json-schema-generator for each discovered component
- [ ] **BLOCK-03**: Property editor forms -- @rjsf renders editable forms from JSON Schema in the editor sidebar
- [ ] **BLOCK-04**: AI codebase scanning -- agent analyzes repo structure, discovers pages and components, auto-generates block definitions in `.deco/blocks/`

### Visual Editor

- [ ] **EDIT-01**: Iframe-based site preview -- loads running site via tunnel URL or localhost in editor panel
- [ ] **EDIT-02**: Prop editing sidebar -- select a section on page, edit its props via auto-generated forms, changes saved to git
- [ ] **EDIT-03**: Drag-and-drop section reordering -- rearrange sections on a page with visual feedback
- [ ] **EDIT-04**: Live preview -- prop changes and section reordering reflect in iframe within 1 second via postMessage protocol
- [ ] **EDIT-05**: Click-to-edit overlays -- data attributes on rendered components enable click-to-select in iframe, opening prop editor for that section
- [ ] **EDIT-06**: Responsive preview -- mobile (375px), tablet (768px), desktop (1440px) toggle resizes iframe
- [ ] **EDIT-07**: Undo/redo -- command pattern across prop edits, section reordering, and section add/remove

### Data (Loaders)

- [ ] **DATA-01**: Loader editor UI -- dedicated panel for managing loaders, equal in prominence and navigation to sections panel
- [ ] **DATA-02**: Loader configuration -- user can define loader data source, configure parameters, and map loader output to section props

### Publishing

- [ ] **PUB-01**: Draft/published workflow -- create draft branch, preview changes, merge to main = publish
- [ ] **PUB-02**: Version history -- show git commit log per page with diff view and one-click revert
- [ ] **PUB-03**: Default template -- React 19 + Vite + Tailwind + shadcn starter project with example sections, example loaders, and `.deco/` config scaffolding

## v1.1 Requirements

Requirements for v1.1 Polish & Integration milestone. Makes v1.0 features work end-to-end.

### Connection Setup

- [ ] **CONN-01**: User can connect their local project folder from within the plugin's empty state (inline wizard with path input, no redirect to project settings)
- [ ] **CONN-02**: Plugin auto-detects the site's running dev server tunnel URL and configures the preview panel without manual URL entry

### Sections Page

- [ ] **SECT-01**: User can view a list of all scanned blocks from `.deco/blocks/` with name, category, and component path
- [ ] **SECT-02**: User can navigate to a block detail view showing its JSON Schema, default props, and a live property editor form
- [ ] **SECT-03**: User can trigger a codebase re-scan from the sections page UI to refresh `.deco/blocks/`

### Loaders Page

- [ ] **LOAD-01**: User can view a list of all loaders from `.deco/loaders/` with name, data source, and binding status
- [ ] **LOAD-02**: User can navigate to a loader detail view showing its configuration, parameters, and which sections consume its output

### Preview Bridge

- [ ] **PREV-01**: Dead code removed — composer's unused `iframeRef` and `useEditorMessages` cleaned up, all iframe comms go through PreviewPanel's `useIframeBridge`
- [ ] **PREV-02**: User can click a section in the iframe preview to select it and open its property editor in the sidebar
- [ ] **PREV-03**: Prop changes in the editor reflect in the iframe preview within 1 second via the postMessage protocol

### Blocks Framework Specification

- [ ] **SPEC-01**: Agent-readable skill document exists that explains `.deco/` directory conventions, block definition format, `data-block-id` attributes, postMessage protocol, and `initEditorBridge()` integration — sufficient for any AI agent to make a site deco-compatible

### Reference Validation

- [ ] **VAL-01**: anjo.chat works end-to-end as a reference implementation — connection setup, sections listing, loader listing, live preview, click-to-select, and prop editing all functional

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Data Sync

- **SYNC-01**: Push-based loader sync -- loaders execute on schedule and sync results to immutable storage (local FS for dev, S3/CDN for production)
- **SYNC-02**: Stale-by-default rendering -- sites read from synced data, never from upstream APIs at render time
- **SYNC-03**: Sync status dashboard -- freshness indicators, health monitoring, last sync timestamps per loader
- **SYNC-04**: Shape-based incremental sync -- only changed data is synced, not full loader output

### Rendering

- **RENDER-01**: SSG output -- pre-render pages at build time from synced data using React Router 7 prerender
- **RENDER-02**: SPA mode -- client-side rendering with synced data for dynamic interactions
- **RENDER-03**: SSR opt-in -- server-side rendering for personalized/real-time pages (10% use case)

### AI

- **AI-01**: AI content copilot -- natural language to page assembly using the site's actual component library
- **AI-02**: AI section suggestions -- recommend sections based on page context and component capabilities

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Theme editor / design tokens UI | Nobody uses it in current admin. Developers own design in code. |
| Built-in SEO panel | Duplicates framework functionality. SEO props belong on a Head section block. |
| Built-in A/B testing | Different product, different expertise. Integrate with LaunchDarkly/Statsig. |
| Built-in analytics dashboard | Duplicates external tools. Use Mesh observability + Plausible/GA. |
| Rich text editor | Bottomless pit. Use Markdown/MDX for content blocks. |
| Proprietary content API / query language | Content is files in git. No lock-in. |
| Form builder / workflow automation | Feature creep. Forms are developer-built sections. |
| Marketplace / plugin store | AI onboarding eliminates the gap. Your codebase IS the component store. |
| Multi-language content management | Use dedicated localization tools (Crowdin, Phrase). Support locale as a loader/prop concern. |
| Modifying admin-cx | Current admin stays untouched for existing enterprise customers. |
| Non-TypeScript codebases | TypeScript type inference is the universal language for schema generation. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### v1.0 (Completed)

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1: Plugin Shell | Complete |
| FOUND-02 | Phase 1: Plugin Shell | Complete |
| FOUND-03 | Phase 1: Plugin Shell | Complete |
| FOUND-04 | Phase 1: Plugin Shell | Complete |
| FOUND-05 | Phase 1: Plugin Shell | Complete |
| FOUND-06 | Phase 1: Plugin Shell | Complete |
| BLOCK-01 | Phase 2: Block Scanner | Complete |
| BLOCK-02 | Phase 2: Block Scanner | Complete |
| BLOCK-03 | Phase 2: Block Scanner | Complete |
| BLOCK-04 | Phase 2: Block Scanner | Complete |
| EDIT-01 | Phase 3: Visual Editor | Complete |
| EDIT-02 | Phase 3: Visual Editor | Complete |
| EDIT-03 | Phase 3: Visual Editor | Complete |
| EDIT-04 | Phase 3: Visual Editor | Complete |
| EDIT-05 | Phase 3: Visual Editor | Complete |
| EDIT-06 | Phase 3: Visual Editor | Complete |
| EDIT-07 | Phase 3: Visual Editor | Complete |
| DATA-01 | Phase 4: Loaders | Complete |
| DATA-02 | Phase 4: Loaders | Complete |
| PUB-01 | Phase 5: Publishing | Complete |
| PUB-02 | Phase 5: Publishing | Complete |
| PUB-03 | Phase 5: Publishing | Complete |

**v1.0 Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

### v1.1 (In Progress)

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 6: Connection Setup | Pending |
| CONN-02 | Phase 6: Connection Setup | Pending |
| SECT-01 | Phase 7: Sections Page | Pending |
| SECT-02 | Phase 7: Sections Page | Pending |
| SECT-03 | Phase 7: Sections Page | Pending |
| LOAD-01 | Phase 8: Loaders Page | Pending |
| LOAD-02 | Phase 8: Loaders Page | Pending |
| PREV-01 | Phase 9: Preview Bridge | Pending |
| PREV-02 | Phase 9: Preview Bridge | Pending |
| PREV-03 | Phase 9: Preview Bridge | Pending |
| SPEC-01 | Phase 10: Documentation & Validation | Pending |
| VAL-01 | Phase 10: Documentation & Validation | Pending |

**v1.1 Coverage:**
- v1.1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-02-14*
*v1.1 traceability added: 2026-02-15*
