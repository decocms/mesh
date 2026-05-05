# Org-Scoped API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/:org/...` (slug-based) the canonical shape for every org-scoped route in the Hono server. Keep old routes mounted with deprecation logs. Migrate the entire frontend (and in-repo `@decocms/mesh-sdk`) to use the new paths in this PR.

**Architecture:** A new `resolveOrgFromPath` middleware mounts on `/api/:org/*` and sets `ctx.organization` from the slug in the URL. Existing route handlers are extracted into reusable functions and dual-mounted: at the new canonical path (with the new middleware) and at the legacy path (with a `logDeprecatedRoute` middleware that `console.log`s every call). Slug becomes immutable so URLs are stable. Frontend builds URLs from `org.slug` via `useProjectContext()`; `x-org-id`/`x-org-slug` headers are dropped.

**Tech Stack:** Hono, TypeScript, Bun test runner, Kysely (Postgres), TanStack Router/Query, React 19.

**Spec:** `docs/superpowers/specs/2026-05-04-org-scoped-api-design.md`

---

## File Structure

### New files
- `apps/mesh/src/api/middleware/resolve-org-from-path.ts` — middleware that reads `:org`, looks up org by slug, sets `ctx.organization`, returns 404/403 as needed.
- `apps/mesh/src/api/middleware/log-deprecated-route.ts` — middleware that `console.log`s old-route hits.
- `apps/mesh/src/api/middleware/resolve-org-from-path.test.ts` — tests for the new middleware (404, 403, success, principal-is-api-key).
- `apps/mesh/src/api/middleware/log-deprecated-route.test.ts` — test for the logging middleware.
- `apps/mesh/src/api/routes/org-scoped.ts` — mounts the `/api/:org/*` Hono sub-app, wires every org-scoped sub-router and applies `resolveOrgFromPath`.
- `apps/mesh/src/api/integration-org-scoped.test.ts` — round-trip test that hits a representative new path and a representative old path, asserts behavior + deprecation log.

### Modified files (server)
- `apps/mesh/src/api/app.ts` — wire the new sub-app at `/api/:org`; add `logDeprecatedRoute` middleware to legacy mounts; keep legacy routes in place.
- `apps/mesh/src/api/routes/downstream-token.ts` — extract the route registration into a reusable factory so it can be dual-mounted (no path change inside; the prefix changes from outside).
- `apps/mesh/src/api/routes/thread-outputs.ts` — same pattern.
- `apps/mesh/src/api/routes/kv.ts` — same pattern (already a factory `createKVRoutes`).
- `apps/mesh/src/api/routes/vm-events.ts` — same pattern.
- `apps/mesh/src/api/routes/deco-sites.ts` — same pattern; also extract `/profile` so it stays unscoped.
- `apps/mesh/src/api/routes/org-sso.ts` — same pattern; new mount at `/api/:org/sso`, legacy at `/api/org-sso`.
- `apps/mesh/src/api/routes/trigger-callback.ts` — same pattern.
- `apps/mesh/src/api/routes/dev-assets.ts` — same pattern; new mount path drops the inner `:orgId` segment.
- `apps/mesh/src/api/routes/virtual-mcp.ts`, `proxy.ts`, `self.ts` — extract registration so MCP routes can be dual-mounted under `/api/:org/mcp/...`.
- `apps/mesh/src/api/routes/registry/public-publish-request.ts` — split internal vs URL prefix.
- `apps/mesh/src/tools/organization/update.ts` — drop `slug` from `ORGANIZATION_UPDATE` accepted input.
- `apps/mesh/src/tools/organization/update.test.ts` (or wherever) — adjust tests.

### Modified files (frontend)
- All 30+ fetch sites listed in Task 16.
- `packages/mesh-sdk/src/hooks/use-mcp-client.ts` — change MCP URL builder to `/api/${org.slug}/mcp/...`.

---

## Task 1: Inspect current `context-factory` org resolution and confirm we have what we need

**Files:**
- Read: `apps/mesh/src/core/context-factory.ts:470-546`
- Read: `apps/mesh/src/storage/types.ts` (for organization type)

- [ ] **Step 1: Read the current org resolution code**

Read lines 470-546 of `context-factory.ts`. Confirm: there is a SQL query that joins `member` and `organization` to verify membership, and it accepts an `orgIdHint` or `orgSlugHint`. We will reuse that query pattern in `resolveOrgFromPath`.

- [ ] **Step 2: Note any helper exports**

Look for any exported helper that does "look up org by slug + verify membership" as a single function. If one exists, we reuse it. If not, the new middleware will inline the same Kysely query.

Expected result: a written note in this conversation about which helpers exist (none expected — the logic is inline today). No code changes in this task.

---

## Task 2: Add `resolveOrgFromPath` middleware (TDD — test first)

**Files:**
- Create: `apps/mesh/src/api/middleware/resolve-org-from-path.test.ts`
- Create: `apps/mesh/src/api/middleware/resolve-org-from-path.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mesh/src/api/middleware/resolve-org-from-path.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import {
  createTestDatabase,
  createTestSchema,
  closeTestDatabase,
  type TestDatabase,
} from "../../storage/test-helpers";
import { resolveOrgFromPath } from "./resolve-org-from-path";

describe("resolveOrgFromPath", () => {
  let db: TestDatabase;
  let app: Hono;

  beforeEach(async () => {
    db = await createTestDatabase();
    await createTestSchema(db.db);

    // Seed an org "acme" with id "org-1" and a member "user-1".
    await db.db.insertInto("organization").values({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      createdAt: new Date().toISOString(),
    }).execute();
    await db.db.insertInto("user").values({
      id: "user-1",
      email: "u@acme.test",
      name: "U",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).execute();
    await db.db.insertInto("member").values({
      id: "mem-1",
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      createdAt: new Date().toISOString(),
    }).execute();

    app = new Hono();
    // Inject a fake meshContext that is "user-1" so the middleware sees them.
    app.use("*", async (c, next) => {
      c.set("meshContext", {
        auth: { user: { id: "user-1" } },
        storage: { db: db.db },
      } as any);
      await next();
    });
    app.use("/api/:org/*", resolveOrgFromPath);
    app.get("/api/:org/probe", (c) => {
      const ctx: any = c.get("meshContext");
      return c.json({ orgId: ctx.organization?.id, orgSlug: ctx.organization?.slug });
    });
  });

  afterEach(async () => {
    await closeTestDatabase(db);
  });

  it("returns 404 when slug does not exist", async () => {
    const res = await app.request("/api/nope/probe");
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a member", async () => {
    await db.db.insertInto("organization").values({
      id: "org-2",
      slug: "other",
      name: "Other",
      createdAt: new Date().toISOString(),
    }).execute();
    const res = await app.request("/api/other/probe");
    expect(res.status).toBe(403);
  });

  it("sets ctx.organization on success", async () => {
    const res = await app.request("/api/acme/probe");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgId).toBe("org-1");
    expect(body.orgSlug).toBe("acme");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun test apps/mesh/src/api/middleware/resolve-org-from-path.test.ts`
Expected: FAIL — `Cannot find module "./resolve-org-from-path"`.

- [ ] **Step 3: Implement the middleware**

```ts
// apps/mesh/src/api/middleware/resolve-org-from-path.ts
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export const resolveOrgFromPath: MiddlewareHandler = async (c, next) => {
  const slug = c.req.param("org");
  if (!slug) {
    throw new HTTPException(400, { message: "org slug missing in path" });
  }

  const ctx: any = c.get("meshContext");
  if (!ctx?.storage?.db) {
    throw new HTTPException(500, { message: "meshContext not initialized" });
  }
  const db = ctx.storage.db;

  const org = await db
    .selectFrom("organization")
    .select(["id", "slug", "name"])
    .where("slug", "=", slug)
    .executeTakeFirst();

  if (!org) {
    throw new HTTPException(404, { message: `organization "${slug}" not found` });
  }

  const userId = ctx.auth?.user?.id;
  const apiKeyOrgId = ctx.auth?.apiKey?.organizationId;

  let isMember = false;
  if (apiKeyOrgId === org.id) {
    isMember = true;
  } else if (userId) {
    const membership = await db
      .selectFrom("member")
      .select(["role"])
      .where("userId", "=", userId)
      .where("organizationId", "=", org.id)
      .executeTakeFirst();
    isMember = !!membership;
  }

  if (!isMember) {
    throw new HTTPException(403, { message: "forbidden: not a member of organization" });
  }

  ctx.organization = { id: org.id, slug: org.slug, name: org.name };
  c.set("meshContext", ctx);

  await next();
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun test apps/mesh/src/api/middleware/resolve-org-from-path.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mesh/src/api/middleware/resolve-org-from-path.ts apps/mesh/src/api/middleware/resolve-org-from-path.test.ts
git commit -m "feat(api): add resolveOrgFromPath middleware

Looks up org by slug from path, verifies membership via session or API
key, sets ctx.organization. Returns 404 for unknown slug, 403 for
non-member.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add `logDeprecatedRoute` middleware (TDD)

**Files:**
- Create: `apps/mesh/src/api/middleware/log-deprecated-route.test.ts`
- Create: `apps/mesh/src/api/middleware/log-deprecated-route.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mesh/src/api/middleware/log-deprecated-route.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { logDeprecatedRoute } from "./log-deprecated-route";

describe("logDeprecatedRoute", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let app: Hono;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    app = new Hono();
    app.use("*", async (c, next) => {
      c.set("meshContext", {
        organization: { slug: "acme" },
        auth: { user: { id: "user-1" } },
      } as any);
      await next();
    });
    app.use("/api/legacy/:id", logDeprecatedRoute);
    app.get("/api/legacy/:id", (c) => c.json({ ok: true }));
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs the call and continues", async () => {
    const res = await app.request("/api/legacy/abc", {
      headers: { "user-agent": "test-agent" },
    });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(
      "deprecated route",
      expect.objectContaining({
        route: "/api/legacy/:id",
        method: "GET",
        org: "acme",
        user: "user-1",
        ua: "test-agent",
      }),
    );
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `bun test apps/mesh/src/api/middleware/log-deprecated-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/mesh/src/api/middleware/log-deprecated-route.ts
import type { MiddlewareHandler } from "hono";

export const logDeprecatedRoute: MiddlewareHandler = async (c, next) => {
  const ctx: any = c.get("meshContext");
  console.log("deprecated route", {
    route: c.req.routePath,
    method: c.req.method,
    org: ctx?.organization?.slug,
    user: ctx?.auth?.user?.id,
    ua: c.req.header("user-agent"),
  });
  await next();
};
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `bun test apps/mesh/src/api/middleware/log-deprecated-route.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mesh/src/api/middleware/log-deprecated-route.ts apps/mesh/src/api/middleware/log-deprecated-route.test.ts
git commit -m "feat(api): add logDeprecatedRoute middleware

console.log instrumentation for legacy routes during deprecation
window. Logs route, method, org slug, user, user-agent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Make org slug immutable

**Files:**
- Modify: `apps/mesh/src/tools/organization/update.ts`
- Modify: any existing test for `ORGANIZATION_UPDATE` that exercises slug changes

- [ ] **Step 1: Find slug handling in `ORGANIZATION_UPDATE`**

Read `apps/mesh/src/tools/organization/update.ts`. Locate:
- The Zod input schema (look for `slug:` field).
- The `updateData` builder line `if (input.slug) updateData.slug = input.slug;`.

- [ ] **Step 2: Write a failing test asserting slug is rejected**

Add to the appropriate test file (find via `bun test --pattern "ORGANIZATION_UPDATE"` or grep in `apps/mesh/src/tools/organization/`). If no test file exists, create `apps/mesh/src/tools/organization/update.test.ts` with the standard pattern.

```ts
it("rejects slug field — slugs are immutable", async () => {
  const result = await ORGANIZATION_UPDATE.handler(
    { id: "org-1", slug: "renamed" } as any,
    ctx,
  );
  // either parsing rejects it (preferred) or handler ignores it
  // assert that org slug in DB is unchanged
  const fresh = await ctx.storage.db
    .selectFrom("organization").select(["slug"]).where("id", "=", "org-1")
    .executeTakeFirst();
  expect(fresh?.slug).not.toBe("renamed");
});
```

Run: `bun test apps/mesh/src/tools/organization/update.test.ts`
Expected: FAIL.

- [ ] **Step 3: Remove `slug` from input schema and update builder**

Edit `apps/mesh/src/tools/organization/update.ts`:
- Remove the `slug: z.string()...` line from the Zod schema.
- Remove the `if (input.slug) updateData.slug = input.slug;` line.

- [ ] **Step 4: Confirm test passes**

Run: `bun test apps/mesh/src/tools/organization/update.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full org tool tests to catch regressions**

Run: `bun test apps/mesh/src/tools/organization/`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mesh/src/tools/organization/
git commit -m "feat(org): make organization slug immutable

Slugs anchor URLs; renames would silently invalidate every saved URL.
Drop slug from ORGANIZATION_UPDATE accepted fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Refactor `downstream-token.ts` for dual mounting + add new routes

**Files:**
- Modify: `apps/mesh/src/api/routes/downstream-token.ts`
- Modify: `apps/mesh/src/api/app.ts` (add new mount, add legacy logging middleware)

- [ ] **Step 1: Read current registration**

Read `apps/mesh/src/api/routes/downstream-token.ts:1-200`. Note that the file currently exports a `Hono` instance with three handlers at `/connections/:connectionId/oauth-token` (POST/GET/DELETE).

- [ ] **Step 2: Refactor to a factory**

If the file exports a static `Hono` instance, change it to export a `createDownstreamTokenRoutes()` factory that returns a fresh `Hono` instance. This lets us mount it at two paths without sharing state. If it's already a factory or already returns a fresh instance, skip.

```ts
// at the bottom of downstream-token.ts, change:
//   export const downstreamTokenRoutes = app;
// to:
export const createDownstreamTokenRoutes = () => {
  const app = new Hono<Env>();
  // ... move all the .post/.get/.delete registrations here ...
  return app;
};
```

- [ ] **Step 3: Update existing legacy mount in `app.ts`**

In `apps/mesh/src/api/app.ts` around line 1500, change:

```ts
app.route("/api", downstreamTokenRoutes);
```

to:

```ts
import { logDeprecatedRoute } from "./middleware/log-deprecated-route";
const legacyDownstreamTokenRoutes = createDownstreamTokenRoutes();
legacyDownstreamTokenRoutes.use("*", logDeprecatedRoute);
app.route("/api", legacyDownstreamTokenRoutes);
```

- [ ] **Step 4: Run the existing oauth-token tests to confirm legacy still works**

Run: `bun test apps/mesh/src/api/routes/downstream-token` (or whatever tests exist).
Expected: pass.

- [ ] **Step 5: Commit the refactor**

```bash
git add apps/mesh/src/api/routes/downstream-token.ts apps/mesh/src/api/app.ts
git commit -m "refactor(api): convert downstream-token to factory + add deprecation log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(New mount under `/api/:org` happens in Task 14 when we wire the org-scoped sub-app — keeping refactors and new mounts separate makes review easier.)

---

## Task 6: Same refactor + deprecation log for `thread-outputs.ts`

**Files:**
- Modify: `apps/mesh/src/api/routes/thread-outputs.ts`
- Modify: `apps/mesh/src/api/app.ts`

- [ ] **Step 1: Convert to factory if needed**

Mirror the pattern from Task 5. Export `createThreadOutputsRoutes()`.

- [ ] **Step 2: Wrap legacy mount with `logDeprecatedRoute`**

In `app.ts` line 1371:

```ts
const legacyThreadOutputsRoutes = createThreadOutputsRoutes();
legacyThreadOutputsRoutes.use("*", logDeprecatedRoute);
app.route("/api", legacyThreadOutputsRoutes);
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/api/routes/thread-outputs`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/api/routes/thread-outputs.ts apps/mesh/src/api/app.ts
git commit -m "refactor(api): factory + deprecation log for thread-outputs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Same for `kv.ts`

**Files:**
- Modify: `apps/mesh/src/api/routes/kv.ts`
- Modify: `apps/mesh/src/api/app.ts`

- [ ] **Step 1: kv.ts already exports `createKVRoutes({kvStorage})` — verify**

Read top of `apps/mesh/src/api/routes/kv.ts`. Confirm the existing factory signature. No refactor needed if already a factory.

- [ ] **Step 2: Wrap legacy mount with `logDeprecatedRoute`**

In `app.ts` line 1387:

```ts
const legacyKvRoutes = createKVRoutes({ kvStorage });
legacyKvRoutes.use("*", logDeprecatedRoute);
app.route("/api", legacyKvRoutes);
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/api/routes/kv`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/api/app.ts
git commit -m "refactor(api): wrap legacy /api/kv routes with deprecation log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Same for `vm-events.ts`

**Files:**
- Modify: `apps/mesh/src/api/routes/vm-events.ts`
- Modify: `apps/mesh/src/api/app.ts`

- [ ] **Step 1: Convert to factory if needed; wrap legacy mount with deprecation log**

In `app.ts` line 1509, replace the existing mount with the factory + `logDeprecatedRoute` pattern. Same shape as Task 6.

- [ ] **Step 2: Run tests**

Run: `bun test apps/mesh/src/api/routes/vm-events`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mesh/src/api/routes/vm-events.ts apps/mesh/src/api/app.ts
git commit -m "refactor(api): factory + deprecation log for vm-events

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Same for `deco-sites.ts` (with split for `/profile`)

**Files:**
- Modify: `apps/mesh/src/api/routes/deco-sites.ts`
- Modify: `apps/mesh/src/api/app.ts`

- [ ] **Step 1: Split routes**

Convert `deco-sites.ts` to export TWO factories:
- `createDecoSitesOrgRoutes()` — `/` (GET) and `/connection` (POST). These will live under `/api/:org/deco-sites`.
- `createDecoSitesUserRoutes()` — `/profile` (GET). Stays at `/api/deco-sites/profile`, no org needed.

- [ ] **Step 2: Update legacy mount**

In `app.ts` line 1503:

```ts
const legacyDecoSitesOrgRoutes = createDecoSitesOrgRoutes();
legacyDecoSitesOrgRoutes.use("*", logDeprecatedRoute);
app.route("/api/deco-sites", legacyDecoSitesOrgRoutes);

// /profile stays unscoped permanently (no log)
app.route("/api/deco-sites", createDecoSitesUserRoutes());
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/api/routes/deco-sites`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/api/routes/deco-sites.ts apps/mesh/src/api/app.ts
git commit -m "refactor(api): split deco-sites into org-scoped and user-scoped routes

/profile stays user-scoped (no org needed). Other routes get
deprecation log.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Same for `org-sso.ts` (rename internal mount path)

**Files:**
- Modify: `apps/mesh/src/api/routes/org-sso.ts`
- Modify: `apps/mesh/src/api/app.ts`

- [ ] **Step 1: Convert to factory `createSsoRoutes()`**

Mirror Task 5. Internal route paths inside the file (`/status`, `/authorize`, `/callback`, `/config`, `/config/enforce`) stay the same — only the external mount point changes.

- [ ] **Step 2: Wrap legacy mount**

In `app.ts` line 1284:

```ts
const legacyOrgSsoRoutes = createSsoRoutes();
legacyOrgSsoRoutes.use("*", logDeprecatedRoute);
app.route("/api/org-sso", legacyOrgSsoRoutes);
```

(New mount lands at `/api/:org/sso` in Task 14.)

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/api/routes/org-sso`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/api/routes/org-sso.ts apps/mesh/src/api/app.ts
git commit -m "refactor(api): factory + deprecation log for org-sso

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Same for `trigger-callback.ts`

**Files:**
- Modify: `apps/mesh/src/api/routes/trigger-callback.ts`
- Modify: `apps/mesh/src/api/app.ts`

- [ ] **Step 1: trigger-callback already exports `createTriggerCallbackRoutes(...)`**

Verify. Keep the existing factory signature.

- [ ] **Step 2: Wrap legacy mount**

In `app.ts` line 1377:

```ts
const legacyTriggerCallbackRoutes = createTriggerCallbackRoutes(/* same args */);
legacyTriggerCallbackRoutes.use("*", logDeprecatedRoute);
app.route("/api", legacyTriggerCallbackRoutes);
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/api/routes/trigger-callback`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/api/app.ts
git commit -m "refactor(api): wrap trigger-callback with deprecation log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Same for `dev-assets.ts` (rewrite path)

**Files:**
- Modify: `apps/mesh/src/api/routes/dev-assets.ts`
- Modify: wherever it's mounted (around `app.ts:1330-1336`)

- [ ] **Step 1: Convert to factory**

Export `createDevAssetsRoutes()`. Inside the file, the route paths use `/:orgId/*` — when this mounts under the new `/api/:org/dev-assets`, the `:orgId` segment becomes redundant. The new factory should expose two variants OR accept a config flag:

```ts
export const createDevAssetsRoutes = (opts: { orgFromPath: boolean }) => {
  const app = new Hono<Env>();
  const prefix = opts.orgFromPath ? "" : "/:orgId";
  app.get(`${prefix}/*`, async (c) => { /* existing handler, but read org from ctx.organization when orgFromPath */ });
  app.put(`${prefix}/*`, async (c) => { /* same */ });
  return app;
};
```

The existing handler reads `:orgId` from path params; when `orgFromPath: true`, it should read from `ctx.organization.id` instead.

- [ ] **Step 2: Wrap legacy mount**

```ts
if (devObjectStorage) {
  const legacy = createDevAssetsRoutes({ orgFromPath: false });
  legacy.use("*", logDeprecatedRoute);
  app.route("/api/dev-assets", legacy);
}
```

- [ ] **Step 3: Run tests**

Run: `bun test apps/mesh/src/api/routes/dev-assets`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/api/routes/dev-assets.ts apps/mesh/src/api/app.ts
git commit -m "refactor(api): factory + deprecation log for dev-assets

Adds orgFromPath option so the same handler serves both legacy
/api/dev-assets/:orgId/* and new /api/:org/dev-assets/*.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Extract MCP handlers + add deprecation log to legacy `/mcp/*`

**Files:**
- Modify: `apps/mesh/src/api/routes/virtual-mcp.ts`
- Modify: `apps/mesh/src/api/routes/proxy.ts`
- Modify: `apps/mesh/src/api/routes/self.ts`
- Modify: `apps/mesh/src/api/app.ts`

- [ ] **Step 1: Convert each of the three MCP route files to factories**

Export `createVirtualMcpRoutes()`, `createProxyRoutes()`, `createSelfRoutes()`. Routes inside (`/`, `/:connectionId`, `/:connectionId/*`, `/gateway/:virtualMcpId`, `/virtual-mcp/:virtualMcpId`, `/self`) stay unchanged.

- [ ] **Step 2: Wrap each legacy mount**

In `app.ts` lines 1340, 1343, 1347:

```ts
const legacyVirtualMcp = createVirtualMcpRoutes();
legacyVirtualMcp.use("*", logDeprecatedRoute);
app.route("/mcp", legacyVirtualMcp);

const legacySelf = createSelfRoutes();
legacySelf.use("*", logDeprecatedRoute);
app.route("/mcp/self", legacySelf);

const legacyProxy = createProxyRoutes();
legacyProxy.use("*", logDeprecatedRoute);
app.route("/mcp", legacyProxy);
```

The `mcpAuth` middleware applied at lines 1308-1325 keeps applying to legacy paths (`/mcp/:connectionId?` etc). For the new `/api/:org/mcp/*` mounts in Task 14, the `resolveOrgFromPath` middleware fronts them and we add a parallel `mcpAuth` mount under the new prefix.

- [ ] **Step 3: Run MCP integration tests**

Run: `bun test apps/mesh/src/api/integration.test.ts`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/api/routes/virtual-mcp.ts apps/mesh/src/api/routes/proxy.ts apps/mesh/src/api/routes/self.ts apps/mesh/src/api/app.ts
git commit -m "refactor(api): factories + deprecation log for MCP routes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Wire the new `/api/:org/*` sub-app

**Files:**
- Create: `apps/mesh/src/api/routes/org-scoped.ts`
- Modify: `apps/mesh/src/api/app.ts`

- [ ] **Step 1: Create the sub-app aggregator**

```ts
// apps/mesh/src/api/routes/org-scoped.ts
import { Hono } from "hono";
import type { Env } from "../app";
import { resolveOrgFromPath } from "../middleware/resolve-org-from-path";
import { createDownstreamTokenRoutes } from "./downstream-token";
import { createThreadOutputsRoutes } from "./thread-outputs";
import { createKVRoutes } from "./kv";
import { createVmEventsRoutes } from "./vm-events";
import { createDecoSitesOrgRoutes } from "./deco-sites";
import { createSsoRoutes } from "./org-sso";
import { createTriggerCallbackRoutes } from "./trigger-callback";
import { createDevAssetsRoutes } from "./dev-assets";
import { createVirtualMcpRoutes } from "./virtual-mcp";
import { createProxyRoutes } from "./proxy";
import { createSelfRoutes } from "./self";

export const createOrgScopedApi = (deps: {
  kvStorage: any;
  triggerCallbackArgs: any;
  devObjectStorage?: any;
}) => {
  const app = new Hono<Env>();
  app.use("*", resolveOrgFromPath);

  app.route("/", createDownstreamTokenRoutes());
  app.route("/", createThreadOutputsRoutes());
  app.route("/", createKVRoutes({ kvStorage: deps.kvStorage }));
  app.route("/vm-events", createVmEventsRoutes());
  app.route("/deco-sites", createDecoSitesOrgRoutes());
  app.route("/sso", createSsoRoutes());
  app.route("/", createTriggerCallbackRoutes(deps.triggerCallbackArgs));

  if (deps.devObjectStorage) {
    app.route("/dev-assets", createDevAssetsRoutes({ orgFromPath: true }));
  }

  // MCP routes — `mcpAuth` is enforced inside the sub-app
  app.route("/mcp", createVirtualMcpRoutes());
  app.route("/mcp/self", createSelfRoutes());
  app.route("/mcp", createProxyRoutes());

  // Watch + events + registry move under /api/:org
  // (handled inline in app.ts — see Task 15)

  return app;
};
```

- [ ] **Step 2: Mount in `app.ts`**

After all legacy mounts are in place (after line 1538 or so), add:

```ts
import { createOrgScopedApi } from "./routes/org-scoped";

const orgScopedApi = createOrgScopedApi({
  kvStorage,
  triggerCallbackArgs: /* same args used at line 1377 */,
  devObjectStorage,
});
app.route("/api/:org", orgScopedApi);
```

- [ ] **Step 3: Smoke test the wiring with one route**

Run: `bun run dev` (in another terminal).

Hit the new oauth-token route via curl with a valid session cookie:
```bash
curl -i 'http://localhost:8787/api/<your-org-slug>/connections/some-conn-id/oauth-token/status'
```

Expected: 200 (or whatever the legacy route would return), no 404. If 404, the wiring is wrong — debug before continuing.

- [ ] **Step 4: Run full test suite**

Run: `bun test apps/mesh/src/api/`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mesh/src/api/routes/org-scoped.ts apps/mesh/src/api/app.ts
git commit -m "feat(api): wire /api/:org/* sub-app with all migrated routes

Mounts the new canonical paths for connections/oauth-token, threads,
kv, vm-events, deco-sites, sso, trigger-callback, dev-assets, and
the full MCP route family. Legacy paths remain mounted with
deprecation logs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Migrate inline routes (`/org/:id/watch`, `/org/:id/events/:type`, registry, oauth-proxy)

**Files:**
- Modify: `apps/mesh/src/api/app.ts`
- Modify: `apps/mesh/src/api/routes/registry/public-publish-request.ts`

- [ ] **Step 1: Extract the four inline handlers into named functions**

In `app.ts` extract:
- The `/org/:organizationId/watch` handler (line 1410) → `watchHandler`
- The `/org/:organizationId/events/:type` handler (line 1390) → `publishEventHandler`
- The `/oauth-proxy/:connectionId/*` handler (line 592) → `oauthProxyHandler`

Keep them as functions defined in `app.ts`. The extraction is just so we can pass the same handler to two `app.all()` calls.

- [ ] **Step 2: Mount under both old and new paths**

```ts
// legacy mounts (with logDeprecatedRoute)
app.use("/org/:organizationId/watch", logDeprecatedRoute);
app.get("/org/:organizationId/watch", watchHandler);

app.use("/org/:organizationId/events/:type", logDeprecatedRoute);
app.post("/org/:organizationId/events/:type", publishEventHandler);

app.use("/oauth-proxy/:connectionId/*", logDeprecatedRoute);
app.all("/oauth-proxy/:connectionId/*", oauthProxyHandler);

// new mounts inside orgScopedApi (or as additions in app.ts after the sub-app mount)
orgScopedApi.get("/watch", watchHandler);
orgScopedApi.post("/events/:type", publishEventHandler);
orgScopedApi.all("/oauth-proxy/:connectionId/*", oauthProxyHandler);
```

For the watch/events handlers: today they read `:organizationId` from path params (UUID). The new versions need to read `ctx.organization.id` (set by `resolveOrgFromPath`) instead. Update accordingly inside the handler — accept org via parameter rather than `c.req.param`.

- [ ] **Step 3: Migrate `/org/:orgRef/registry/publish-request`**

In `apps/mesh/src/api/routes/registry/public-publish-request.ts:277`, the function `publicPublishRequestRoutes(app, ctx)` registers the route inline on the passed `app`. Change it to register at BOTH the old and new path, using a shared handler. The new path is `/api/:org/registry/publish-request` and reads the org from `ctx.organization` (set by `resolveOrgFromPath` since the new mount is under `/api/:org`).

- [ ] **Step 4: Run tests**

Run: `bun test apps/mesh/src/api/`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mesh/src/api/app.ts apps/mesh/src/api/routes/registry/public-publish-request.ts
git commit -m "feat(api): migrate watch/events/registry/oauth-proxy to /api/:org

Each handler is now mounted at both the legacy /org/:id/... path
(with deprecation log) and the new /api/:org/... path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Migrate `.well-known/oauth-protected-resource` paths

**Files:**
- Modify: `apps/mesh/src/api/app.ts` or wherever the well-known handlers live

- [ ] **Step 1: Locate current well-known handlers**

Grep for `well-known/oauth-protected-resource` in `apps/mesh/src/api/`. Find both registration points:
- `/mcp/:gateway?/:connectionId/.well-known/oauth-protected-resource/*`
- `/.well-known/oauth-protected-resource/mcp/:connectionId`

- [ ] **Step 2: Extract handler to a function**

Pull the handler into `wellKnownProtectedResourceHandler`.

- [ ] **Step 3: Mount under new paths**

Add new mounts:
```ts
orgScopedApi.get("/mcp/:gateway?/:connectionId/.well-known/oauth-protected-resource/*", wellKnownProtectedResourceHandler);
orgScopedApi.get("/mcp/:connectionId/.well-known/oauth-protected-resource", wellKnownProtectedResourceHandler);
```

Wrap the two legacy mounts with `logDeprecatedRoute`.

The handler logic must update the issued metadata to point at the new MCP URL (`/api/:org/mcp/:connectionId`) when called via the new path. When called via the legacy path, keep returning the legacy URL so existing clients don't break.

- [ ] **Step 4: Run tests, smoke-test with curl**

```bash
curl 'http://localhost:8787/api/<org-slug>/mcp/<conn-id>/.well-known/oauth-protected-resource'
```

Expected: 200 with metadata pointing at `/api/<org-slug>/...` URLs.

- [ ] **Step 5: Commit**

```bash
git add apps/mesh/src/api/app.ts
git commit -m "feat(api): mount oauth-protected-resource metadata under /api/:org

Each handler picks up the right resource URL based on which path it
was called from. Legacy paths keep returning legacy URLs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Cross-route integration test (one new + one old, asserting deprecation log)

**Files:**
- Create: `apps/mesh/src/api/integration-org-scoped.test.ts`

- [ ] **Step 1: Write integration test**

```ts
// apps/mesh/src/api/integration-org-scoped.test.ts
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { createApp } from "./app";
import { createTestDatabase, createTestSchema, closeTestDatabase } from "../storage/test-helpers";

describe("org-scoped API coexistence", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let db: any;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    db = await createTestDatabase();
    await createTestSchema(db.db);
    // seed: org "acme" + user "u-1" + member + a connection
    // ... (use the same fixtures as integration.test.ts)
    app = await createApp({ database: db, /* etc */ });
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await closeTestDatabase(db);
  });

  it("new path serves the route and does NOT log deprecation", async () => {
    const res = await app.fetch(
      new Request("http://test/api/acme/connections/conn-1/oauth-token/status", {
        headers: { /* auth headers */ },
      }),
    );
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(
      "deprecated route",
      expect.anything(),
    );
  });

  it("legacy path still serves and DOES log deprecation", async () => {
    const res = await app.fetch(
      new Request("http://test/api/connections/conn-1/oauth-token/status", {
        headers: { /* auth headers + x-org-id */ },
      }),
    );
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(
      "deprecated route",
      expect.objectContaining({ route: "/api/connections/:connectionId/oauth-token/status" }),
    );
  });

  it("new path returns 404 for unknown org slug", async () => {
    const res = await app.fetch(
      new Request("http://test/api/unknown-org/connections/conn-1/oauth-token/status"),
    );
    expect(res.status).toBe(404);
  });

  it("new path returns 403 for non-member", async () => {
    // seed another user not in acme
    const res = await app.fetch(
      new Request("http://test/api/acme/connections/conn-1/oauth-token/status", {
        headers: { /* auth as a non-member */ },
      }),
    );
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test**

Run: `bun test apps/mesh/src/api/integration-org-scoped.test.ts`
Expected: 4 passing.

- [ ] **Step 3: Commit**

```bash
git add apps/mesh/src/api/integration-org-scoped.test.ts
git commit -m "test(api): cross-route coexistence + 404/403 + deprecation log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Migrate frontend fetch sites — connections oauth-token

**Files:**
- Modify: `apps/mesh/src/web/routes/orgs/connections.tsx:833`
- Modify: `apps/mesh/src/web/views/registry/monitor-connections-panel.tsx:170`
- Modify: `apps/mesh/src/web/views/virtual-mcp/add-connection-dialog.tsx:653,767,904`
- Modify: `apps/mesh/src/web/views/virtual-mcp/index.tsx:1362`
- Modify: `apps/mesh/src/web/components/details/connection/index.tsx:318,381`
- Modify: `apps/mesh/src/web/hooks/use-auto-install-github.ts:120`

- [ ] **Step 1: For each call site, replace URL and drop `x-org-id` header**

For each site, the change is:

Before:
```ts
fetch(`/api/connections/${id}/oauth-token`, {
  headers: { "x-org-id": org.id, ... },
  ...
});
```

After:
```ts
fetch(`/api/${org.slug}/connections/${id}/oauth-token`, {
  headers: { /* no x-org-id */ ... },
  ...
});
```

Get `org.slug` from `useProjectContext()` if not already in scope.

- [ ] **Step 2: Run typecheck**

Run: `bun run --cwd=apps/mesh check`
Expected: pass.

- [ ] **Step 3: Smoke-test in dev server**

Open the connections page, exercise OAuth-token flows. Watch dev-server logs — should see no `"deprecated route"` for these endpoints after this task.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/web/
git commit -m "refactor(web): migrate connections oauth-token calls to /api/:org

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Migrate frontend — thread outputs

**Files:**
- Modify: `apps/mesh/src/web/components/chat/message/thread-outputs.tsx:36`

- [ ] **Step 1: Update URL to `/api/${org.slug}/threads/${encodeURIComponent(threadId)}/outputs`**

- [ ] **Step 2: Drop any `x-org-id` header at this site**

- [ ] **Step 3: Smoke-test in chat UI; commit**

```bash
git add apps/mesh/src/web/components/chat/message/thread-outputs.tsx
git commit -m "refactor(web): migrate thread-outputs fetch to /api/:org

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Migrate frontend — vm-events SSE

**Files:**
- Modify: `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx:189`

- [ ] **Step 1: Update URL**

Before: `/api/vm-events?virtualMcpId=${...}&branch=${...}&x-org-id=${...}`
After: `/api/${org.slug}/vm-events?virtualMcpId=${...}&branch=${...}`

(Drop the `x-org-id` query parameter — the org is now in the path.)

- [ ] **Step 2: Smoke-test (open VM panel; commit)**

```bash
git add apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx
git commit -m "refactor(web): migrate vm-events SSE to /api/:org

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 21: Migrate frontend — deco-sites

**Files:**
- Modify: `apps/mesh/src/web/layouts/home-page/index.tsx:66`
- Modify: `apps/mesh/src/web/components/import-from-deco-dialog.tsx:37,116`

- [ ] **Step 1: For `/api/deco-sites/profile` — leave it unchanged** (user-scoped, stays global)

- [ ] **Step 2: For `/api/deco-sites` and `/api/deco-sites/connection` — prepend `${org.slug}/`**

```ts
fetch(`/api/${org.slug}/deco-sites`, ...)
fetch(`/api/${org.slug}/deco-sites/connection`, ...)
```

Drop any `x-org-id` headers.

- [ ] **Step 3: Smoke-test (import-from-deco dialog); commit**

```bash
git add apps/mesh/src/web/
git commit -m "refactor(web): migrate deco-sites fetches to /api/:org (profile stays global)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 22: Migrate frontend — org-sso (rename to /sso)

**Files:**
- Modify: `apps/mesh/src/web/views/settings/org-sso.tsx:192`
- Modify: `apps/mesh/src/web/hooks/use-org-sso.ts:21,35,58,81,100`
- Modify: `apps/mesh/src/web/components/sso-required-screen.tsx:16`

- [ ] **Step 1: Replace each URL**

Pattern: `/api/org-sso/<x>` → `/api/${org.slug}/sso/<x>`. The `?orgId=` query param can stay or be dropped (it's now redundant with the path slug — drop it).

- [ ] **Step 2: Smoke-test (settings → SSO); commit**

```bash
git add apps/mesh/src/web/
git commit -m "refactor(web): migrate org-sso fetches to /api/:org/sso

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 23: Migrate frontend — `/org/:id/watch` SSE

**Files:**
- Modify: `apps/mesh/src/web/components/details/workflow/hooks/use-workflow-sse.ts:35`
- Modify: `apps/mesh/src/web/hooks/use-decopilot-events.ts:33`

- [ ] **Step 1: Replace URL**

Before: `/org/${orgId}/watch?types=...&x-org-id=...`
After: `/api/${org.slug}/watch?types=...`

(Drop the `x-org-id` query param.)

- [ ] **Step 2: Smoke-test (open a workflow with live updates, open decopilot); commit**

```bash
git add apps/mesh/src/web/
git commit -m "refactor(web): migrate watch SSE to /api/:org/watch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 24: Migrate frontend — MCP URLs

**Files:**
- Modify: `apps/mesh/src/web/routes/orgs/connections.tsx:805`
- Modify: `apps/mesh/src/web/views/registry/monitor-connections-panel.tsx:211`
- Modify: `apps/mesh/src/web/views/virtual-mcp/add-connection-dialog.tsx:624`
- Modify: `apps/mesh/src/web/views/virtual-mcp/index.tsx:1246`

- [ ] **Step 1: Replace each MCP URL**

Pattern: `/mcp/${id}` → `/api/${org.slug}/mcp/${id}`; `/mcp/self` → `/api/${org.slug}/mcp/self`.

These are URLs that may be displayed to the user (copy-paste into their MCP client config). Confirm with user-visible UI: if a URL is shown for copy-paste, it must use the new path. If it's used internally for fetch, just update.

- [ ] **Step 2: Smoke-test (connections page, virtual MCP page); commit**

```bash
git add apps/mesh/src/web/
git commit -m "refactor(web): migrate MCP URL builders to /api/:org/mcp

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 25: Migrate `@decocms/mesh-sdk` MCP URL builder

**Files:**
- Modify: `packages/mesh-sdk/src/hooks/use-mcp-client.ts:44`

- [ ] **Step 1: Update URL builder to include org slug**

The current builder constructs `/mcp/${connectionId}` or `/mcp`. Update it to construct `/api/${orgSlug}/mcp/${connectionId}` or `/api/${orgSlug}/mcp`. The hook needs the org slug — pull from `useProjectContext()` (which the SDK already provides) so this requires no API change at the call site.

- [ ] **Step 2: Search the SDK for any other URL builders or header injectors**

```bash
grep -rn "x-org-id\|x-org-slug\|/mcp\|/api/" packages/mesh-sdk/src/
```

For each finding, update similarly.

- [ ] **Step 3: Run SDK tests + frontend tests**

```bash
bun test packages/mesh-sdk/
bun test apps/mesh/src/web/
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/mesh-sdk/
git commit -m "refactor(mesh-sdk): migrate MCP URL builders to /api/:org/mcp

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 26: Frontend full sweep — ensure no `x-org-id` / `x-org-slug` headers remain

**Files:**
- Search: `apps/mesh/src/web/`
- Search: `packages/mesh-sdk/src/`

- [ ] **Step 1: Grep for any remaining org headers**

```bash
grep -rn 'x-org-id\|x-org-slug' apps/mesh/src/web/ packages/mesh-sdk/src/
```

Expected: **no matches** by the time this task is complete.

- [ ] **Step 2: For each remaining occurrence, decide:**
- If it's a fetch to a route in our migration table → update URL + drop header.
- If it's a fetch to a route that's NOT in the migration table (e.g., `/api/auth/*`) → keep the header (those routes still use header-based org resolution).

- [ ] **Step 3: Run typecheck + tests**

```bash
bun run --cwd=apps/mesh check
bun test apps/mesh/src/web/
```

- [ ] **Step 4: Commit if anything changed**

```bash
git add apps/mesh/src/web/ packages/mesh-sdk/
git commit -m "refactor(web): final sweep for stale x-org-id headers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 27: Manual UI smoke + zero-deprecation-log verification

**Files:** none

- [ ] **Step 1: Start dev server**

Run: `bun run dev`

- [ ] **Step 2: Walk through the golden paths**

In a browser, log in, then exercise:
- Connections list → create a new connection → OAuth it
- Decopilot chat → send a message
- Switch orgs in the sidebar
- Settings → SSO config view + status
- Threads view → open a thread and view outputs
- Virtual MCP view → copy a connection URL (verify it shows the new `/api/:org/mcp/...` shape)

Throughout, watch the dev-server stdout for any `"deprecated route"` log lines. **There should be zero from these UI flows.**

- [ ] **Step 3: DevTools network sweep**

Open DevTools → Network. Repeat the flows. For every request to `/api/...`:
- Confirm the URL contains the org slug.
- Confirm there is no `x-org-id` or `x-org-slug` header.

If you find a violation, fix it, re-commit, restart the verification.

- [ ] **Step 4: Run the full check suite**

```bash
bun test
bun run check
bun run lint
bun run fmt
```

Expected: all pass.

- [ ] **Step 5: Commit `bun run fmt` changes if any**

```bash
git add -A
git commit -m "chore: bun fmt"  # only if there are formatting changes
```

---

## Task 28: Update CLAUDE.md / docs about the new path convention

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a short subsection under "Architecture" or "Common Gotchas"**

Add to `CLAUDE.md`:

```md
### API path convention

All org-scoped API routes use the canonical shape `/api/:org/...` where `:org` is the
organization slug. The `resolveOrgFromPath` middleware (in
`apps/mesh/src/api/middleware/`) handles slug → org lookup and membership check, then
sets `ctx.organization`.

Legacy routes without org in the path are still mounted, with a `console.log("deprecated
route", ...)` emission via the `logDeprecatedRoute` middleware. They will be removed in
a follow-up PR after the deprecation window. New code MUST use the org-scoped paths.

Org slugs are immutable (cannot be changed via `ORGANIZATION_UPDATE`) so URLs remain
stable.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document /api/:org/* convention and slug immutability

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 29: Final verification before PR

**Files:** none

- [ ] **Step 1: Full check suite**

```bash
bun test
bun run check
bun run lint
bun run fmt:check
```

Expected: all pass.

- [ ] **Step 2: Diff review**

```bash
git log origin/main..HEAD --oneline
git diff origin/main...HEAD --stat
```

Confirm: every commit aligns with a task in this plan; no stray edits.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin tlgimenes/org-scoped-api
gh pr create --base main --title "feat(api): migrate to /api/:org/* canonical paths" --body "$(cat <<'EOF'
## Summary

- Adds `/api/:org/...` (slug-based) as the canonical path shape for every org-scoped route.
- Legacy routes coexist; emit `console.log("deprecated route", {...})` on every call.
- Frontend (and `@decocms/mesh-sdk`) fully migrated — zero deprecation logs from UI flows.
- Org slug becomes immutable to keep URLs stable.

## Spec
`docs/superpowers/specs/2026-05-04-org-scoped-api-design.md`

## Test plan
- [ ] `bun test` passes
- [ ] `bun run check` passes
- [ ] Manual UI walkthrough produces zero `"deprecated route"` log lines
- [ ] DevTools confirms no `x-org-id`/`x-org-slug` headers on `/api/...` requests
- [ ] OAuth flow still works against legacy `/oauth-proxy/:connectionId/*` (third-party redirect URIs unchanged)

## Follow-ups (out of scope)
- Remove legacy routes after a 2-4 week deprecation window (separate PR).
- `/oauth-proxy/:connectionId/*` stays mounted indefinitely (third-party-registered redirect URIs).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

After writing the plan I checked:

- **Spec coverage:** All 40 rows in the from→to table map to a task (Tasks 5–16 server-side, Tasks 18–25 frontend). The `stays global` list is implicitly preserved by NOT touching those routes. Slug immutability covered by Task 4.
- **Type consistency:** Factory function names (`createDownstreamTokenRoutes`, `createThreadOutputsRoutes`, etc.) reused consistently across server tasks and the aggregator (Task 14).
- **No placeholders:** Each task has exact file paths, code blocks, and commands. Some refactor tasks (5–13) reference "the existing handler" rather than reproducing it because the handler bodies are large and unchanged — only the registration shape changes.
- **Scope:** Plan is large (~29 tasks) but each task is bite-sized and independently committable. Review can happen task-by-task. A reasonable split would be: Tasks 1–17 (backend + tests) as one PR, Tasks 18–29 (frontend + verification) as a second PR — but the user explicitly asked for one PR. Kept as one.
- **Risk areas explicitly flagged in tasks:**
  - Task 13 (MCP routes): `mcpAuth` middleware needs to be re-applied under the new prefix.
  - Task 16 (well-known): handler must return URLs matching the path it was called from.
  - Task 25 (mesh-sdk): SDK is in-repo, so it can be updated in this PR.
