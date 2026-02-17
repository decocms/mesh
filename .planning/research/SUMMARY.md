# Research Summary: Stack-Agnostic CMS (Mesh Plugin)

**Domain:** Headless CMS with visual editing, push-based data sync, AI-powered codebase analysis
**Researched:** 2026-02-14
**Overall confidence:** HIGH (stack aligns with existing Mesh platform, all key libraries verified)

## Executive Summary

This CMS plugin builds on the Mesh platform's existing stack (Bun + Hono + Vite 7 + React 19 + Kysely + Zod 4) with minimal new dependencies. The four core technical challenges -- codebase analysis, push-based sync, SSG rendering, and visual editing -- each have mature, verified solutions available in 2025-2026.

For codebase analysis, Mesh already uses `ts-json-schema-generator` to convert TypeScript types to JSON Schema, and `@rjsf` to render those schemas as editable forms. Adding `ts-morph` (v27.0.2) provides the AST navigation layer needed to find components and their prop types automatically. This pipeline (ts-morph -> ts-json-schema-generator -> @rjsf -> zod validation) is the core innovation path and builds entirely on proven patterns already in the codebase.

For push-based data sync, the architecture uses Mesh's existing event bus for cron-scheduled loader execution, writing results to immutable versioned storage (deconfig/git for dev, S3-compatible R2 for production). This is simpler than full database replication -- it is cron-triggered ETL where loaders fetch from upstream APIs and push results to storage. Sites read from storage, never from upstream APIs at render time. Electric SQL (v1.5.4) was evaluated but deferred: it adds infrastructure complexity (sync service) that is overkill for the initial single-writer, schedule-driven model. It remains a strong option for Phase 4+ if real-time collaborative editing becomes a requirement.

For visual editing, the industry has converged on iframe + postMessage + data attributes. Sanity, DatoCMS, Payload, and dotCMS all use this pattern. No framework-specific library is needed -- a custom typed message protocol with a thin client-side overlay SDK is the right approach. This is simpler and more maintainable than alternatives like stega encoding or heavy visual builder frameworks.

Content configuration (pages, blocks, loaders) lives in git via deconfig MCP tools, giving version history, branching, and PR review for free. Operational metadata (sync state, scan progress) lives in Postgres via Kysely.

## Key Findings

**Stack:** Extend Mesh's existing stack with ts-morph (AST navigation) and React Router 7 (SSG). Only 2 genuinely new dependencies needed -- everything else (ts-json-schema-generator, @rjsf, zod-from-json-schema, event bus, object storage, deconfig) already exists in Mesh.

**Architecture:** Plugin-based with five subsystems: Scanner, Schema Registry, Content Store, Sync Engine, Visual Editor. Content in git (deconfig), operational state in Postgres, synced data in immutable storage (FS/S3). Communication via MCP tools (server) and postMessage (editor-iframe).

**Critical pitfall:** Framework detection surface area -- start with explicit component registration, add AI detection for one framework only in Phase 2. The "works with any TS site" promise must be delivered incrementally, not all at once.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation: Plugin Skeleton + Page CRUD** - CMS ServerPlugin + ClientPlugin, deconfig integration, basic page read/write from `.deco/pages/`
   - Addresses: Plugin infrastructure, git-based content storage
   - Avoids: Scope creep (Pitfall 6), plugin architecture afterthought (Pitfall 11)

2. **Block Scanner + Schema Forms** - ts-morph pipeline, JSON Schema generation, @rjsf property forms, manual component registration as fallback
   - Addresses: Component schema registry, property editor forms
   - Avoids: Framework detection overreach (Pitfall 1) by starting with configurable scan patterns

3. **Visual Editor + Preview** - iframe + postMessage protocol, click-to-edit overlays, live prop editing
   - Addresses: Visual editing, live preview (the "wow" feature)
   - Avoids: Multi-rendering-mode complexity (Pitfall 7) by supporting SPA mode only first

4. **Data Sync Engine** - Event-bus-driven loader execution, immutable storage writes, sync status dashboard
   - Addresses: Push-based data sync, loader management
   - Avoids: Unbounded storage (Pitfall 3) by designing retention policies from the start

5. **SSG Template + Production** - React Router 7 default template, R2 production storage, publish workflow
   - Addresses: Production site rendering, SSG/SPA output
   - Avoids: Treating existing customers as beta testers (Pitfall 9)

**Phase ordering rationale:**
- Plugin skeleton first because everything depends on the ServerPlugin/ClientPlugin infrastructure and deconfig integration
- Scanner before visual editor because the editor needs block schemas to render property forms
- Visual editor before sync because static prop editing delivers value without the data layer
- Sync engine can be parallelized with visual editor if team capacity allows (it only depends on Phase 1)
- SSG template last because it depends on both the visual editor (for preview) and sync (for data reads)

**Research flags for phases:**
- Phase 2: Needs deeper research on ts-morph performance with large codebases (1000+ components)
- Phase 3: Needs deeper research on iframe HMR coordination and CSP handling across deployment targets
- Phase 5: Needs deeper research on React Router 7 framework mode + prerender configuration for dynamic CMS routes

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries verified current, most already in Mesh codebase. Only ts-morph is truly new. |
| Features | HIGH | Feature landscape well-mapped from competitor analysis (Sanity, Builder.io, Payload, DatoCMS) |
| Architecture | HIGH | Extends proven Mesh plugin architecture, uses existing deconfig/event bus/MCP patterns |
| Pitfalls | HIGH | Well-documented by competitors and by company's own history with admin-cx |
| Data Sync Model | MEDIUM | Event-bus + immutable storage is simple and proven, but the specific loader execution flow needs prototyping |
| React Router 7 SSG | MEDIUM | Built-in prerender is documented but dynamic CMS route generation needs a proof-of-concept |

## Gaps to Address

- ts-morph performance on large codebases (1000+ components): need profiling to decide if scanning runs at startup, on-demand, or as a background job
- React Router 7 framework mode + prerender with dynamic routes generated from CMS data: need a proof-of-concept
- iframe postMessage protocol specification: need to define the exact message types, handshake sequence, error handling, and HMR coordination before Phase 3
- Deconfig concurrent editing behavior: what happens when two editors modify different pages simultaneously on the same branch? Need to verify deconfig handles per-file commits
- S3/R2 performance characteristics for high-frequency reads during SSG builds: need benchmarking
- ts-json-schema-generator limitations: which TypeScript type constructs does it NOT support? Need to test with real-world component prop types (conditional types, template literals, utility types)
