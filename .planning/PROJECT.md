# deco.cx v2 — Stack-Agnostic Agentic CMS

## What This Is

A new version of deco.cx built as a Mesh plugin — a stack-agnostic, git-based site editor and data platform that works with any TypeScript codebase. You connect your Lovable, Next.js, FastStore, or whatever project, an AI agent maps your components into editable blocks, and you get a visual editor + synced data layer + production monitoring without changing your framework.

It replaces the current deco.cx admin for new customers while the existing admin continues serving current enterprise clients.

## Core Value

Any TypeScript site gets a production-grade CMS with visual editing and resilient data in minutes — not months.

## Requirements

### Validated

- ✓ Mesh plugin with visual site editor (pages, sections, loaders as first-class) — v1.0
- ✓ Git-based config storage (page compositions, block configs, loader configs) — v1.0
- ✓ Local development via tunnel + local-fs MCP — v1.0

### Active

- [ ] End-to-end integration polish (connection setup, sections/loaders pages, preview bridge)
- [ ] i18n page variant system (locale-aware page files, variant management in editor)
- [ ] Blocks framework specification (agent-readable skill doc for deco compatibility)
- [ ] anjo.chat as validated reference implementation

### Deferred

- Push-based data sync layer (loaders sync to immutable storage, stale-by-default) — v2
- AI-powered onboarding that scans a codebase and maps components to blocks — v2
- SPA/SSG-first architecture with SSR as opt-in — v2
- Production deployment with S3/CDN-backed data layer — v2

### Out of Scope

- Modifying admin-cx — current admin stays untouched for existing customers
- Making the deco/ runtime framework agnostic to Deno/Fresh — we rewrite the ideas, not the code
- Non-TypeScript codebases — TypeScript is the requirement
- Building a Lovable competitor — we are the production layer, not the generation layer

## Context

### Why now

deco.cx has 100 enterprise customers on a deco/Fresh-only CMS that is powerful but locked to one stack. The vibecoding wave (Lovable, Bolt, v0) is creating millions of sites that need production tooling. VTEX is forcing 2000+ stores to migrate from IO to FastStore. The market is screaming for a stack-agnostic CMS that meets you where you are.

Meanwhile, Mesh has matured into a robust plugin-based platform with auth, org/project scoping, observability, event bus, and a proven plugin architecture (workflows, reports, object storage, private registry all ship as plugins). Building the new CMS as a Mesh plugin means we inherit all of this infrastructure.

### The FastStore migration agent (Project Vitoo) is the proof

Yesterday's team meeting launched the FastStore migration agent — AI that takes VTEX IO stores, migrates them to FastStore v3, and layers deco CMS on top. This is the exact same motion generalized: take any existing site, use AI to layer deco's blocks system on top, and deliver a CMS.

### What we learned from admin-cx

The current admin is bloated with features nobody uses (theme editor, SEO panel, complex loader UX). The new version starts minimal: pages, sections, loaders — and loaders get equal prominence because data fetching is a core competency, not a detail.

### Existing assets to leverage

- `mesh-plugin-site-builder` — earlier exploration, useful for reference
- `local-fs` MCP in `../mcps` — for connecting to sites running locally
- Tunnel infrastructure — already built for local development
- GitHub OAuth connection — Tavano already built external repo connection
- The deco blocks concepts (sections, loaders, pages) — proven over 3 years, just need stack-agnostic reimplementation

### The data layer insight (inspired by ElectricSQL)

Current approach: request comes in → SSR → call loader APIs → wait → render → respond.

New approach: loaders continuously sync data to immutable storage. Sites render from cached/synced data. Always fast. Resilient to upstream API failures. Most data (product shelves, category pages) doesn't change 95% of the time — stop hitting origin needlessly.

- **Local dev**: loaders sync to filesystem (immutable, versioned)
- **Production**: loaders sync to S3 + CDN (immutable, globally distributed)
- **Shape-based sync**: like ElectricSQL, clients subscribe to data "shapes" that update incrementally
- **Stale-by-default**: data is always available, freshness is configurable per loader
- **SSR is opt-in**: most sites should be SPA + SSG hybrids reading from synced data. Only 10% need dedicated SSR infrastructure.

### Rendering architecture

Pages are: **code + config + data**

- **Code**: the actual components (React, Preact, Svelte — whatever the site uses)
- **Config**: which sections appear on which pages, with what props (stored as JSON in `.deco/`)
- **Data**: loader outputs synced to immutable storage

Default rendering modes:
1. **SSG** — pre-rendered at build/sync time from synced data (default for most pages)
2. **SPA** — client-side rendering with synced data (for dynamic interactions)
3. **SSR** — server-side rendering for the 10% that need it (SEO-critical + personalized)

The system should steer users toward SSG/SPA and only opt into SSR when justified.

### Default template

For greenfield sites (or when users want to start fresh), the default template mirrors the frontend decisions already made in Mesh:

- **React 19** + **Vite** + **Tailwind** + **shadcn**
- Same build tooling, same dev experience
- This is the "blessed path" — other stacks (Next.js, Astro, etc.) are supported but the template is opinionated
- Template includes: example sections with typed props, example loaders with synced data, `.deco/` config scaffolding

## Constraints

- **Tech stack**: Must be a Mesh plugin (React 19, Bun, TypeScript). Uses Mesh's plugin interfaces (ClientPlugin + ServerPlugin)
- **Timeline**: Demo-ready for team presentation within ~1 week
- **Team**: Builds on work Tavano (GitHub connection, self-hosting) and Sacci (FastStore migration agent) are already doing
- **Compatibility**: Must work with Next.js, FastStore, and Lovable-generated projects as first targets
- **Data**: Sites that use the synced data layer must work even when upstream APIs are down

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build as Mesh plugin, not modify admin-cx | Clean start, born agnostic, inherits Mesh infrastructure, doesn't risk existing customers | ✓ Good |
| Push-based data sync (ElectricSQL-inspired) | Sites need to be fast and resilient, not dependent on origin APIs at render time | — Deferred to v2 |
| SPA/SSG default, SSR opt-in | 90% of sites don't need SSR; SSR creates infrastructure overhead | — Deferred to v2 |
| Loaders as first-class (equal to sections in UI) | Data fetching is a core competency, not a detail | ✓ Good (UI built, needs polish) |
| AI-powered onboarding | Manual block mapping doesn't scale | — Deferred to v2 |
| TypeScript-only | Reasonable constraint that covers 95%+ of target sites | ✓ Good |
| Props ARE the content, i18n only for UI chrome | Page variants at file level, not component-level i18n | ✓ Good |
| Page variants as locale files | `page_home.en-US.json` convention, page-level not field-level | ✓ Good |
| anjo.chat as reference implementation | Every feature must work with a real app, not just unit tests | — v1.1 |
| Blocks framework as agent-readable spec | Any AI agent should be able to make a site deco-compatible from the spec | — v1.1 |

## Current Milestone: v1.1 Polish & Integration

**Goal:** Make v1.0 features work end-to-end, validated against anjo.chat as reference implementation.

**Target features:**
- Streamlined site connection setup (inline wizard, not "go to settings")
- Sections page working end-to-end (list scanned blocks, navigate to detail)
- Loaders page working end-to-end (list loaders, detail view, clear binding UX)
- Preview bridge fix (unified iframeRef, click-to-select, live prop editing)
- i18n variant system as first-class feature (locale switcher, variant management)
- Blocks framework specification (agent-readable skill doc)
- anjo.chat validated as working reference implementation

---
*Last updated: 2026-02-15 after v1.1 milestone start*
