# Org-Scoped API — Design Spec

**Date:** 2026-05-04
**Branch:** `tlgimenes/org-scoped-api`
**Status:** Approved

## Goal

Make the org slug a mandatory, authoritative segment of every URL for routes that depend on org context. Old routes coexist (with deprecation logs) until usage drops to zero in a follow-up PR. The frontend is fully migrated in this PR.

## Principles

1. **URL is the source of truth** for org context. The `:org` segment in the path sets `ctx.organization`. Session "active org" is no longer used to scope requests on new routes.
2. **Slugs are immutable.** Drop `slug` from `ORGANIZATION_UPDATE` accepted fields. A slug rename would silently invalidate every URL anyone has saved.
3. **Coexistence over breaking.** Every migrated route is dual-mounted. The new path is canonical. The old path stays mounted and emits a `console.log("deprecated route", { route, method, org, user, ua })`.
4. **`x-org-id` / `x-org-slug` headers go away on the frontend.** They keep working on old routes (so external callers don't break during the deprecation window).
5. **Frontend migrates fully in this PR.** No frontend caller hits an old route by merge time. That makes deprecation logs meaningful — anything that appears is an external integration, the SDK, or something missed.

## Non-Goals

- Removing the old routes (separate PR after the deprecation window).
- Project-level path scoping (`/api/:org/:project/...`). Org-only for now.
- Migrating Better Auth's own routes or `/.well-known/oauth-authorization-server/*` (RFC-mandated locations).
- Updating `@decocms/mesh-sdk` if it lives outside this repo (will be a follow-up dependency bump if so).

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Path identifier | **Slug** (not UUID) | Matches existing org-scoped routes (`/api/:org/decopilot`); human-readable in logs, dashboards, and support; slugs are unique and indexed by Postgres' implicit UNIQUE-constraint index. |
| Path shape | `/api/:org/...` for everything (including MCP) | Single consistent root; easier to reason about. Coexistence makes the breakage to existing Cursor/Claude configs non-blocking. |
| Path semantics | **Authoritative** — sets `ctx.organization` | The point of putting org in the URL is for the URL to be the source of truth. Cross-tab races and "active org" mutation rounds disappear. |
| Slug renames | **Disabled** | Avoids URL invalidation. Existing renamed orgs are unaffected; only future renames are blocked. |
| Deprecation tracking | `console.log("deprecated route", {...})` | Simplest possible thing; greppable. |

## From → To Route Table

### Migrated routes

| # | Old | New | Notes |
|---|---|---|---|
| **Admin / connections** | | | |
| 1 | `POST /api/connections/:connectionId/oauth-token` | `POST /api/:org/connections/:connectionId/oauth-token` | |
| 2 | `DELETE /api/connections/:connectionId/oauth-token` | `DELETE /api/:org/connections/:connectionId/oauth-token` | |
| 3 | `GET /api/connections/:connectionId/oauth-token/status` | `GET /api/:org/connections/:connectionId/oauth-token/status` | |
| **Threads / outputs** | | | |
| 4 | `GET /api/threads/:threadId/outputs` | `GET /api/:org/threads/:threadId/outputs` | |
| **KV** | | | |
| 5 | `GET /api/kv/:key` | `GET /api/:org/kv/:key` | |
| 6 | `PUT /api/kv/:key` | `PUT /api/:org/kv/:key` | |
| 7 | `DELETE /api/kv/:key` | `DELETE /api/:org/kv/:key` | |
| **VM events** | | | |
| 8 | `GET /api/vm-events` | `GET /api/:org/vm-events` | |
| **Deco sites** | | | |
| 9 | `GET /api/deco-sites` | `GET /api/:org/deco-sites` | |
| 10 | `POST /api/deco-sites/connection` | `POST /api/:org/deco-sites/connection` | |
| 11 | `GET /api/deco-sites/profile` | *unchanged* | User-scoped, not org-scoped |
| **Org SSO** | | | |
| 12 | `GET /api/org-sso/status` | `GET /api/:org/sso/status` | Renamed `org-sso` → `sso` (org now in path) |
| 13 | `GET /api/org-sso/authorize` | `GET /api/:org/sso/authorize` | |
| 14 | `GET /api/org-sso/callback` | `GET /api/:org/sso/callback` | External IdP redirect URI changes; coexistence covers existing IdP configs |
| 15 | `GET /api/org-sso/config` | `GET /api/:org/sso/config` | |
| 16 | `POST /api/org-sso/config` | `POST /api/:org/sso/config` | |
| 17 | `POST /api/org-sso/config/enforce` | `POST /api/:org/sso/config/enforce` | |
| 18 | `DELETE /api/org-sso/config` | `DELETE /api/:org/sso/config` | |
| **Trigger callback** | | | |
| 19 | `POST /api/trigger-callback` | `POST /api/:org/trigger-callback` | Bearer token still required; path slug must match token's org |
| **Files** | | | |
| 20 | `GET /api/:org/files/*` | *unchanged* | Already org-scoped |
| 21 | `GET/PUT /api/dev-assets/:orgId/*` | `GET/PUT /api/:org/dev-assets/*` | Local-dev only; consolidate naming |
| **Decopilot** | | | |
| 22 | `GET /api/:org/decopilot/allowed-models` | *unchanged* | Already org-scoped |
| 23 | `POST /api/:org/decopilot/stream` | *unchanged* | |
| 24 | `POST /api/:org/decopilot/runtime/stream` | *unchanged* | |
| 25 | `POST /api/:org/decopilot/cancel/:threadId` | *unchanged* | |
| 26 | `GET /api/:org/decopilot/attach/:threadId` | *unchanged* | |
| **OpenAI compat** | | | |
| 27 | `POST /api/:org/v1/chat/completions` | *unchanged* | Already org-scoped |
| **Watch / events / registry** | | | |
| 28 | `GET /org/:organizationId/watch` | `GET /api/:org/watch` | Move under `/api/`, slug instead of UUID |
| 29 | `POST /org/:organizationId/events/:type` | `POST /api/:org/events/:type` | |
| 30 | `POST /org/:orgRef/registry/publish-request` | `POST /api/:org/registry/publish-request` | |
| **MCP runtime** | | | |
| 31 | `ALL /mcp` | `ALL /api/:org/mcp` | Default Decopilot virtual MCP |
| 32 | `ALL /mcp/:connectionId` | `ALL /api/:org/mcp/:connectionId` | |
| 33 | `ALL /mcp/:connectionId/*` | `ALL /api/:org/mcp/:connectionId/*` | |
| 34 | `ALL /mcp/gateway/:virtualMcpId` | `ALL /api/:org/mcp/gateway/:virtualMcpId` | Backward-compat alias retained |
| 35 | `ALL /mcp/virtual-mcp/:virtualMcpId` | `ALL /api/:org/mcp/virtual-mcp/:virtualMcpId` | |
| 36 | `ALL /mcp/self` | `ALL /api/:org/mcp/self` | |
| 37 | `ALL /mcp/dev-assets/:orgId/*` | `ALL /api/:org/mcp/dev-assets/*` | |
| **OAuth proxy / OAuth metadata for MCP** | | | |
| 38 | `ALL /oauth-proxy/:connectionId/*` | `ALL /api/:org/oauth-proxy/:connectionId/*` | Old path stays mounted **indefinitely** (third-party-registered redirect URIs) |
| 39 | `GET /mcp/:gateway?/:connectionId/.well-known/oauth-protected-resource/*` | `GET /api/:org/mcp/:gateway?/:connectionId/.well-known/oauth-protected-resource/*` | Follows the MCP path |
| 40 | `GET /.well-known/oauth-protected-resource/mcp/:connectionId` | `GET /api/:org/mcp/:connectionId/.well-known/oauth-protected-resource` | Consolidate to one shape |

### Stays global (not migrated)

| Route | Why |
|---|---|
| `GET /health/live`, `GET /health/ready`, `GET /metrics` | System / unauth |
| `GET /api/config` | Public bootstrap config |
| `ALL /api/auth/*` (Better Auth) | Pre-auth handshake |
| `POST /api/auth/custom/local-session` | Local-mode bootstrap |
| `GET /api/auth/custom/domain-lookup`, `POST /domain-join`, `POST /domain-setup` | Determines which org to join — predates org context |
| `GET /.well-known/oauth-authorization-server/*/:gateway?/:connectionId?` | RFC-mandated path location |
| `GET /api/tools/management` | Pre-OAuth-consent listing |
| `GET /api/deco-sites/profile` | User-scoped, not org-scoped |

## Implementation Mechanics

### Org-resolution middleware (`resolveOrgFromPath`)

Mounts on every `/api/:org/*` group.

1. Read `:org` from path params.
2. Look up the organization by slug.
3. Return `404` if no such org.
4. Verify the authenticated principal (user session OR API key) is a member. Return `403` otherwise.
5. Set `ctx.organization = { id, slug, ... }`.

The existing `context-factory.ts` logic that derives org from session/headers stays in place, but only fires for unscoped (old) routes. New routes ignore session active-org entirely.

### Deprecation log middleware (`logDeprecatedRoute`)

Mounts on every old route group:

```ts
console.log("deprecated route", {
  route: c.req.routePath,
  method: c.req.method,
  org: ctx.organization?.slug,
  user: ctx.auth?.user?.id,
  ua: c.req.header("user-agent"),
});
```

That's the entire instrumentation. Grep for `"deprecated route"` in production logs to see who's still calling.

### Slug immutability

- Remove `slug` from `ORGANIZATION_UPDATE`'s input schema (`apps/mesh/src/tools/organization/update.ts`).
- Remove `if (input.slug) updateData.slug = input.slug;` from the update builder.
- No DB constraint added — application is the only writer.

### Frontend migration pattern

For every `fetch(...)` and query hook in `apps/mesh/src/web/`:

1. Get `org.slug` from `useProjectContext()` (already available everywhere via shell layout).
2. Build the URL as `/api/${org.slug}/...` (or `/api/${org.slug}/mcp/...`).
3. Drop the `x-org-id` and `x-org-slug` headers from the request.

The TanStack Router `:org` param already gives us the slug at every component. No new state, no new hook.

If `@decocms/mesh-sdk` exposes a fetch helper that injects `x-org-id`, update the SDK in this PR (if in `packages/`) or in a follow-up dependency bump (if external). Investigation needed during implementation.

### Route registration shape

```ts
const orgScopedApi = new Hono();
orgScopedApi.use("*", resolveOrgFromPath);
orgScopedApi.route("/connections/:connectionId/oauth-token", oauthTokenRoutes);
orgScopedApi.route("/threads/:threadId/outputs", threadRoutes);
// ...etc
app.route("/api/:org", orgScopedApi);
```

Old routes stay mounted at their existing locations with `logDeprecatedRoute` middleware applied, sharing the same handler functions (no logic duplication — only routing differs).

### Test strategy

For each migrated route, one integration test that hits both the new and old path and asserts:

- New path: 200 with correct org-scoped behavior; 404 on unknown slug; 403 on wrong-org member.
- Old path: still 200 and emits a deprecation log line.

A small helper fans the same assertions across all routes.

## Verification Before Merge

- `bun test` — all existing + new per-route integration tests pass.
- `bun run check` — typechecks across all workspaces.
- `bun run lint` and `bun run fmt`.
- **Manual UI smoke** — run `bun run dev`; exercise: connections list, create connection, OAuth a connection, decopilot chat, org switcher, settings → SSO, threads view. Watch the dev-server logs for `"deprecated route"` lines — **expect zero from the frontend**.
- **DevTools network review** — confirm every `/api/...` request URL contains the org slug and no `x-org-id` header is sent.

## Post-Merge

- Watch production logs for `"deprecated route"` over a 2–4 week window.
- When the rate is near zero (or only known external callers remain), open a follow-up PR to remove old routes. Out of scope here.
- Old `/oauth-proxy/:connectionId/*` is the one exception: stays mounted indefinitely (third-party redirect URIs).

## Rollback

- Old routes still serve every request the frontend was making before. Rolling back the frontend bundle alone restores prior behavior.
- The org-resolution middleware is additive on a new path group; reverting just the new mounts disables them with no impact on existing routes.
