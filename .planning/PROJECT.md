# MCP Mesh

## What This Is

MCP Mesh is an open-source control plane for Model Context Protocol (MCP) traffic. It provides a unified layer for authentication, routing, and observability between MCP clients (Cursor, Claude, VS Code) and MCP servers. The system is a monorepo using Bun workspaces with TypeScript, Hono (API), and React 19 (UI), with a plugin system where each plugin exposes sidebar navigation, server tools, and client UI.

## Core Value

Developers can connect any MCP server to Mesh and immediately get auth, routing, observability, and a polished admin UI — including a full visual site editor for Deco-compatible sites.

## Current Milestone: v1.4 — Storefront Onboarding

**Goal:** Build the self-service onboarding flow for e-commerce users — enter a storefront URL, get an instant diagnostic report with real data, then guided setup into the platform.

**Target features:**
- Pre-auth storefront diagnostic: user enters URL, system crawls public data (HTML, PageSpeed, tech stack, AI company context)
- Public shareable report page with real diagnostic results
- Login gate after initial value delivery — org creation from email domain
- Post-login chat interview to understand user goals and objectives
- Agent recommendations based on company context + declared goals
- Connection requests driven by recommended agents (VTEX, GA, etc.)

## Requirements

### Validated

- ✓ Plugin system with `enabledPlugins` per project — v1.0
- ✓ Projects as first-class entities with their own sidebar and routes — v1.0
- ✓ Connections (MCP servers) scoped to organizations — v1.0
- ✓ Better Auth (OAuth 2.1, API keys, SSO) — v1.0
- ✓ Kysely ORM with SQLite/PostgreSQL support — v1.0
- ✓ OpenTelemetry tracing and metrics — v1.0
- ✓ Event bus (CloudEvents v1.0, pub/sub) — v1.0

### Active

- [ ] Pre-auth public page with storefront URL input
- [ ] Backend diagnostic agents: HTML crawl, PageSpeed, tech stack detection, AI company context
- [ ] Public shareable report page (decocms.com/storefront-report/<domain>)
- [ ] Login gate + org creation from email domain
- [ ] Post-login chat interview for user goals/objectives
- [ ] Agent recommendation engine based on context + goals
- [ ] Connection setup driven by recommended agents

### Out of Scope

- Paid API integrations (SimilarWeb, DataForSEO, ReclameAqui) — free/public data only for v1.4
- E-mail nurture sequences / marketing automation
- VTEX Day booth/kiosk mode
- WhatsApp integration for report sharing

## Context

- Onboarding is e-commerce focused (storefront vertical) — not a general-purpose onboarding
- The diagnostic is the "hook" — like PageSpeed Insights but for storefronts
- `storefront-skills` repo (github.com/decocms/storefront-skills) has performance and SEO skill definitions
- Reports plugin (`packages/mesh-plugin-reports/`) exists with REPORTS_BINDING — diagnostic results can leverage this
- Chat UI already exists with AI streaming via decopilot routes
- MCP tools via `defineTool()` for diagnostic agents; public API endpoint wraps them for pre-auth access
- Stila (stilaai.com) is a reference for onboarding UX — asks for company info, builds context, then becomes useful
- MyStoryBrand.com is a reference for the interview/wizard pattern

## Constraints

- **Tech stack**: Bun + TypeScript + Hono + React 19 — no new runtimes
- **Formatting**: Biome, always run `bun run fmt` — enforced by pre-commit hook
- **React**: No `useEffect`, no `useMemo`/`useCallback`/`memo` — React 19 compiler handles it
- **Packages**: kebab-case filenames in shared packages
- **Scope**: Each phase = one PR, must be independently reviewable and mergeable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|------------|
| Pre-auth diagnostic before login | Show value first, reduce friction — PageSpeed Insights pattern | Confirmed |
| Public PageSpeed API (no key) | Free, rate-limited but fine for dev/demo — add key later | Confirmed |
| Diagnostic agents as MCP tools | Aligned with agent architecture, reusable by other agents | Confirmed |
| Public API endpoint wraps MCP tools | Pre-auth needs a thin Hono route that runs tools internally | Confirmed |
| E-commerce vertical only | Focused on storefronts — not general-purpose onboarding | Confirmed |
| Report page is public + shareable | Can be shared via link, login required to edit/expand | Confirmed |

---
*Last updated: 2026-02-25 — Milestone v1.4 started*
