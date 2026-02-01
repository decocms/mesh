# Roadmap: Site Builder Plugin

**Milestone:** v1.0 - AI-Assisted Site Building with Live Preview

## Overview

Extend the existing Task Runner infrastructure with a Site Builder plugin that enables AI-assisted site development with live preview. Users connect to a local Deno/Fresh site, create tasks, and watch agents implement changes with HMR in real-time.

## Architecture Decision

**Approach:** New plugin (`mesh-plugin-site-builder`) that extends Task Runner capabilities, NOT a separate MCP.

- Site tools added to existing `mcps/task-runner/` MCP
- New plugin reuses task-runner hooks (`useTasks`, `useAgentSessions`)
- Skills copied from `../context/skills/` to MCP
- Connection filtering by stack detection (deno.json with deco/ import)

---

## Phase 1: Site Builder Plugin Foundation

**Goal:** Create Site Builder plugin with site-aware connection filtering and basic UI layout.

### Requirements
- R1.1: New sidebar menu item "Sites" (separate from "Tasks")
- R1.2: Connection dropdown filtering (only show local-fs with deno.json)
- R1.3: Basic plugin layout with preview area placeholder
- R1.4: Route structure: `/sites`, `/sites/:connectionId`

### Deliverables
- [ ] Create `packages/mesh-plugin-site-builder/` plugin scaffold
- [ ] Register plugin with sidebar item (icon: Globe or similar)
- [ ] Implement SITE_BUILDER_BINDING for connection filtering
- [ ] Add stack detection utility (check for deno.json with deco/ import)
- [ ] Create site list view with filtered connections
- [ ] Create site detail view layout (preview area + collapsible tasks)

### Success Criteria
- Sites appears as separate sidebar item
- Only Deno/Deco folders show in connection dropdown
- Route navigation works: /sites → /sites/:connectionId

---

## Phase 2: Dev Server & Preview

**Goal:** Control dev server and display live preview with HMR.

### Requirements
- R2.1: Detect stack from deno.json/package.json
- R2.2: Start/stop dev server via MCP tool
- R2.3: Auto-detect running port from server output
- R2.4: Live preview iframe with detected URL
- R2.5: Page/route selector dropdown

### Deliverables
- [ ] Add `SITE_STACK_DETECT` tool to task-runner MCP
- [ ] Add `SITE_DEV_START` tool (runs `deno task dev` or equivalent)
- [ ] Add `SITE_DEV_STOP` tool (kills dev server process)
- [ ] Add `SITE_DEV_STATUS` tool (running state, port, URL)
- [ ] Add `SITE_PAGES` tool (list routes from .deco/blocks/pages-*.json)
- [ ] Create PreviewFrame component with iframe and URL bar
- [ ] Create PageSelector dropdown populated by SITE_PAGES
- [ ] Implement port detection from dev server stdout

### Success Criteria
- Click "Start" → dev server runs → preview shows site
- Page selector shows available routes
- HMR updates visible in preview (Fresh built-in)

---

## Phase 3: Task Integration & Skills

**Goal:** Integrate task board components and add site-building skills.

### Requirements
- R3.1: Reuse task-runner hooks and components
- R3.2: Collapsible task panel in site detail view
- R3.3: Copy landing page skills to MCP
- R3.4: Site context passed to agents (stack, paths, conventions)

### Deliverables
- [ ] Import and wrap task-runner's `useTasks` hook
- [ ] Import and wrap task-runner's `useAgentSessions` hook
- [ ] Create CollapsibleTaskPanel component
- [ ] Copy `decocms-landing-pages/SKILL.md` to MCP skills
- [ ] Copy `deco-sales-pitch-pages/SKILL.md` to MCP skills
- [ ] Add `SKILL_LIST` tool to expose bundled skills
- [ ] Add `SKILL_GET` tool to retrieve skill details
- [ ] Implement site context injection into agent prompts
- [ ] Add skill selector dropdown in site detail view

### Success Criteria
- Task panel shows tasks from .beads/tasks.json
- Skills available in dropdown
- Agent spawned with full site context

---

## Phase 4: Polish & Streaming

**Goal:** Optimize UX with streaming progress and better integration.

### Requirements
- R4.1: Agent output visible during execution
- R4.2: Streaming page creation (placeholder → real sections)
- R4.3: Budget display and controls
- R4.4: Session persistence and resume

### Deliverables
- [ ] Add agent output panel (or integrate with chat)
- [ ] Implement placeholder section pattern for streaming builds
- [ ] Add budget indicator from session data
- [ ] Add stop button for running agents
- [ ] Polish mobile/responsive layout
- [ ] Add error states and retry logic

### Success Criteria
- User sees agent working in real-time
- Page builds incrementally visible via HMR
- Can stop runaway agents
- Sessions resumable after page refresh

---

## Dependency Map

```
Phase 1 (Foundation)
    ↓
Phase 2 (Dev Server & Preview)
    ↓
Phase 3 (Task Integration & Skills)
    ↓
Phase 4 (Polish & Streaming)
```

All phases are sequential - each builds on the previous.

---

## Files to Create/Modify

### New Files
```
packages/mesh-plugin-site-builder/
├── package.json
├── index.tsx                    # Plugin definition
├── components/
│   ├── site-list.tsx           # Connection list with stack badges
│   ├── site-detail.tsx         # Main detail view
│   ├── preview-frame.tsx       # Iframe with controls
│   ├── page-selector.tsx       # Route dropdown
│   ├── task-panel.tsx          # Collapsible task board
│   └── skill-selector.tsx      # Skill dropdown
├── hooks/
│   ├── use-site.ts             # Site-specific state
│   ├── use-dev-server.ts       # Dev server control
│   └── use-preview.ts          # Preview URL state
└── lib/
    ├── binding.ts              # SITE_BUILDER_BINDING
    └── stack-detection.ts      # Stack detection utils

mcps/task-runner/server/tools/
├── site-stack.ts               # SITE_STACK_DETECT
├── site-dev.ts                 # SITE_DEV_START/STOP/STATUS
├── site-pages.ts               # SITE_PAGES
└── skills.ts                   # SKILL_LIST/GET

mcps/task-runner/skills/
├── decocms-landing-pages.md    # Copied from ../context/skills/
└── deco-sales-pitch-pages.md   # Copied from ../context/skills/
```

### Modified Files
```
packages/mesh-plugin-task-runner/
├── hooks/use-tasks.ts          # Export for reuse
└── hooks/use-agent-sessions.ts # Export for reuse

mcps/task-runner/server/index.ts  # Register new tools
```

---

## Skills to Bundle

From `../context/skills/`:

1. **decocms-landing-pages/SKILL.md** (547 lines)
   - Page JSON structure at `.deco/blocks/pages-{slug}.json`
   - Section anatomy (TSX with Props interface, JSDoc)
   - Design styles: Flashy, Elegant, Pragmatic, Dashboard
   - Color system and conventions

2. **deco-sales-pitch-pages/SKILL.md** (483 lines)
   - Sales pitch workflow with research phases
   - SalesPitch sections: Hero, Metrics, Problem, ClosedLoop, Solution, ROI, CTA
   - Image generation with nano-banana-agent

These skills provide the domain knowledge agents need to build Deco sites correctly.

---

## Out of Scope (v1)

- Multi-stack support (Next.js, Astro) - Deno/Deco first
- Remote site deployment - local development only
- Visual page builder / drag-drop - agent builds via code
- MCP UI in chat panel - use collapsible task panel for now

---

*Roadmap created: 2026-02-01*
