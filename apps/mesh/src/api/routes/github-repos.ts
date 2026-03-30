/**
 * GitHub Repos API Route
 *
 * Lets users install the GitHub App, select repositories, and import them
 * as projects during Site Editor onboarding.
 *
 * Required env vars:
 *   GITHUB_APP_SLUG        – App slug (for installation URL)
 *   GITHUB_APP_ID          – Numeric App ID (for JWT generation)
 *   GITHUB_APP_PRIVATE_KEY – PEM private key (for JWT signing)
 *
 * Flow:
 *   1. GET    /auth/url        → returns { url } to open GitHub App installation
 *   2. GET    /auth/callback   → stores installation_id, closes popup
 *   3. GET    /status          → { connected: boolean }
 *   4. DELETE /auth/disconnect → removes stored installation
 *   5. GET    /                → lists repos via installation access token
 *   6. POST   /connection      → creates a connection for a selected repo
 */

import { createSign } from "node:crypto";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import { getUserId } from "../../core/mesh-context";
import { getSettings } from "../../settings";
import { fetchToolsFromMCP } from "../../tools/connection/fetch-tools";
import {
  ADMIN_MCP,
  getSupabaseConfig,
  resolveProfileId,
  getOrCreateDecoApiKey,
  getOrCreateDecoSite,
} from "./deco-supabase";

type Variables = { meshContext: MeshContext };

const app = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// In-memory state map for CSRF protection (short-lived, process-scoped)
// ---------------------------------------------------------------------------

interface StateEntry {
  userId: string;
  expiresAt: number;
}

const stateMap = new Map<string, StateEntry>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function pruneExpiredStates() {
  const now = Date.now();
  for (const [k, v] of stateMap) {
    if (v.expiresAt < now) stateMap.delete(k);
  }
}

// ---------------------------------------------------------------------------
// GitHub App JWT + Installation Access Token
// ---------------------------------------------------------------------------

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function normalizePem(raw: string): string {
  const trimmed = raw.replace(/\\n/g, "\n").trim();
  const match = trimmed.match(
    /-----BEGIN ([A-Z ]+)-----(.+?)-----END ([A-Z ]+)-----/s,
  );
  if (!match) return trimmed;
  const tag = match[1]!;
  const b64 = match[2]!.replace(/\s/g, "");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${tag}-----\n${lines.join("\n")}\n-----END ${tag}-----\n`;
}

function generateGitHubAppJWT(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: appId, iat: now - 60, exp: now + 600 }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  return `${unsigned}.${signer.sign(privateKeyPem, "base64url")}`;
}

function getAppConfig() {
  const { githubAppSlug, githubAppId, githubAppPrivateKey } = getSettings();
  if (!githubAppSlug || !githubAppId || !githubAppPrivateKey) return null;
  return {
    slug: githubAppSlug,
    id: githubAppId,
    pem: normalizePem(githubAppPrivateKey),
  };
}

async function createInstallationToken(
  installationId: string,
): Promise<string> {
  const cfg = getAppConfig();
  if (!cfg) {
    throw new Error(
      "GITHUB_APP_SLUG, GITHUB_APP_ID, and GITHUB_APP_PRIVATE_KEY are required",
    );
  }
  const jwt = generateGitHubAppJWT(cfg.id, cfg.pem);
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Installation token request failed: ${res.status} – ${body}`,
    );
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

// ---------------------------------------------------------------------------
// DB helpers — read/write/delete the installation_id for a user
// ---------------------------------------------------------------------------

async function getInstallationId(
  ctx: MeshContext,
  userId: string,
): Promise<string | null> {
  const row = await ctx.db
    .selectFrom("github_credentials")
    .select("installation_id")
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return row?.installation_id ?? null;
}

async function upsertInstallation(
  ctx: MeshContext,
  userId: string,
  installationId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await ctx.db
    .insertInto("github_credentials")
    .values({
      user_id: userId,
      installation_id: installationId,
      access_token: null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc
        .column("user_id")
        .doUpdateSet({ installation_id: installationId, updated_at: now }),
    )
    .execute();
}

async function deleteInstallation(
  ctx: MeshContext,
  userId: string,
): Promise<void> {
  await ctx.db
    .deleteFrom("github_credentials")
    .where("user_id", "=", userId)
    .execute();
}

// ---------------------------------------------------------------------------
// Auth guard (every handler except the callback which is a GitHub redirect)
// ---------------------------------------------------------------------------

for (const path of [
  "/auth/url",
  "/auth/disconnect",
  "/status",
  "/",
  "/connection",
]) {
  app.use(path, async (c, next) => {
    if (!c.get("meshContext").auth.user?.id)
      return c.json({ error: "Unauthorized" }, 401);
    return next();
  });
}

// ---------------------------------------------------------------------------
// GET /auth/url
// ---------------------------------------------------------------------------

app.get("/auth/url", (c) => {
  const cfg = getAppConfig();
  if (!cfg) {
    return c.json({ error: "GitHub integration is not configured" }, 503);
  }

  const ctx = c.get("meshContext");
  const userId = ctx.auth.user!.id;

  pruneExpiredStates();
  const nonce = crypto.randomUUID();
  stateMap.set(nonce, { userId, expiresAt: Date.now() + STATE_TTL_MS });

  const callbackUrl = new URL(
    "/api/github-repos/auth/callback",
    c.req.url,
  ).toString();

  const params = new URLSearchParams({
    state: nonce,
    redirect_uri: callbackUrl,
  });
  const url = `https://github.com/apps/${cfg.slug}/installations/new?${params.toString()}`;

  return c.json({ url });
});

// ---------------------------------------------------------------------------
// GET /auth/callback
//
// GitHub redirects here after the user installs (or updates) the App.
//
// Possible parameter combinations:
//  a) state + installation_id              → fresh install
//  b) installation_id + setup_action=update → repo access change (no state)
// ---------------------------------------------------------------------------

app.get("/auth/callback", async (c) => {
  const state = c.req.query("state");
  const installationId = c.req.query("installation_id");
  const setupAction = c.req.query("setup_action"); // "install" | "update"

  const successHtml = /* html */ `<!DOCTYPE html>
<html>
<head><title>GitHub Connected</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'github-oauth-success' }, '*');
    window.close();
  } else {
    document.body.innerText = 'Connected! You can close this window.';
  }
</script>
</body>
</html>`;

  const errorHtml = (msg: string) => /* html */ `<!DOCTYPE html>
<html>
<head><title>GitHub Error</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'github-oauth-error', error: ${JSON.stringify(msg)} }, '*');
    window.close();
  } else {
    document.body.innerText = 'Error: ${msg.replace(/'/g, "\\'")}';
  }
</script>
</body>
</html>`;

  // (b) Updating an existing installation (changing repo access).
  if (!state && installationId && setupAction === "update") {
    console.info(`[github-repos] installation updated: ${installationId}`);
    return c.html(successHtml);
  }

  // (a) Fresh install: state + installation_id.
  if (!state) return c.html(errorHtml("Missing state parameter"), 400);
  if (!installationId) {
    return c.html(errorHtml("Missing installation_id"), 400);
  }

  pruneExpiredStates();
  const entry = stateMap.get(state);
  if (!entry || entry.expiresAt < Date.now()) {
    return c.html(errorHtml("Invalid or expired state"), 400);
  }
  stateMap.delete(state);

  const ctx = c.get("meshContext");
  if (!ctx) return c.html(errorHtml("Session context unavailable"), 500);

  try {
    await upsertInstallation(ctx, entry.userId, installationId);
  } catch (err) {
    console.error("[github-repos] failed to persist installation:", err);
    return c.html(errorHtml("Failed to save installation"), 500);
  }

  return c.html(successHtml);
});

// ---------------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------------

app.get("/status", async (c) => {
  const ctx = c.get("meshContext");
  const userId = ctx.auth.user!.id;
  const instId = await getInstallationId(ctx, userId);

  if (!instId) {
    return c.json({ connected: false, configureUrl: null });
  }

  let configureUrl = `https://github.com/settings/installations/${instId}`;

  const cfg = getAppConfig();
  if (cfg) {
    try {
      const jwt = generateGitHubAppJWT(cfg.id, cfg.pem);
      const res = await fetch(
        `https://api.github.com/app/installations/${instId}`,
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          account: { login: string; type: string };
        };
        const { login, type } = data.account;
        configureUrl =
          type === "Organization"
            ? `https://github.com/organizations/${login}/settings/installations/${instId}`
            : `https://github.com/settings/installations/${instId}`;
      }
    } catch {
      // Fall back to the personal-account URL format.
    }
  }

  return c.json({ connected: true, configureUrl });
});

// ---------------------------------------------------------------------------
// DELETE /auth/disconnect
// ---------------------------------------------------------------------------

app.delete("/auth/disconnect", async (c) => {
  const ctx = c.get("meshContext");
  const userId = ctx.auth.user!.id;
  await deleteInstallation(ctx, userId);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /
// Lists repositories accessible through the stored installation.
// ---------------------------------------------------------------------------

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  owner: { login: string; avatar_url: string };
  updated_at: string | null;
}

app.get("/", async (c) => {
  const ctx = c.get("meshContext");
  const userId = ctx.auth.user!.id;
  const installationId = await getInstallationId(ctx, userId);

  if (!installationId) {
    return c.json({ connected: false, repos: [] });
  }

  const cfg = getAppConfig();
  if (!cfg) {
    return c.json({ error: "GitHub integration is not configured" }, 503);
  }

  try {
    const token = await createInstallationToken(installationId);
    const res = await fetch(
      "https://api.github.com/installation/repositories?per_page=100",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[github-repos] installation repos error: ${res.status}`,
        body,
      );
      return c.json({ error: "Failed to fetch repositories" }, 502);
    }
    const data = (await res.json()) as {
      repositories: GitHubRepo[];
      total_count: number;
    };
    return c.json({
      connected: true,
      repos: data.repositories ?? [],
      configureUrl: `https://github.com/settings/installations/${installationId}`,
      installUrl: `https://github.com/apps/${cfg.slug}/installations/new`,
    });
  } catch (err) {
    console.error("[github-repos] GET repos error:", err);
    return c.json({ error: "Failed to fetch repositories" }, 502);
  }
});

// ---------------------------------------------------------------------------
// POST /connection
// Creates a GitHub connection and, when Supabase is configured, also
// provisions a deco.cx site and an admin MCP connection for it.
// ---------------------------------------------------------------------------

app.post("/connection", async (c) => {
  const ctx = c.get("meshContext");
  const userId = getUserId(ctx);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const email = ctx.auth.user?.email;

  const installationId = await getInstallationId(ctx, userId);
  if (!installationId) {
    return c.json({ error: "GitHub App not installed" }, 401);
  }

  const connectionToken = await createInstallationToken(installationId);

  let body: {
    repoFullName: string;
    connId: string;
    adminConnId: string;
    orgId: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const { repoFullName, connId, adminConnId, orgId } = body;
  if (!repoFullName || !connId || !orgId) {
    return c.json(
      { error: "repoFullName, connId, and orgId are required" },
      400,
    );
  }

  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoFullName)) {
    return c.json({ error: "Invalid repoFullName" }, 400);
  }

  const membership = await ctx.db
    .selectFrom("member")
    .select("member.id")
    .where("member.userId", "=", userId)
    .where("member.organizationId", "=", orgId)
    .executeTakeFirst();

  if (!membership) return c.json({ error: "Forbidden" }, 403);

  const [owner, repoName] = repoFullName.split("/");

  try {
    const connection = await ctx.storage.connections.create({
      id: connId,
      organization_id: orgId,
      created_by: userId,
      title: `GitHub — ${repoFullName}`,
      description: `GitHub repository: ${repoFullName}`,
      connection_type: "HTTP",
      connection_url: "https://api.githubcopilot.com/mcp/",
      connection_token: connectionToken,
      connection_headers: null,
      oauth_config: null,
      configuration_state: {
        GITHUB_REPO_OWNER: owner,
        GITHUB_REPO_NAME: repoName,
        GITHUB_REPO_FULL_NAME: repoFullName,
      },
      metadata: { source: "github-import" },
      icon: null,
      app_name: "GitHub",
      app_id: null,
      tools: null,
      configuration_scopes: null,
    });

    // -----------------------------------------------------------------------
    // Deco.cx site + admin MCP connection (best-effort).
    // Skipped when Supabase isn't configured or the user has no deco profile.
    // -----------------------------------------------------------------------
    let createdAdminConnId: string | null = null;
    let decoSiteName: string | null = null;

    const sbConfig = getSupabaseConfig();
    if (sbConfig && email && adminConnId) {
      try {
        const { supabaseUrl, serviceKey } = sbConfig;
        const profileId = await resolveProfileId(
          supabaseUrl,
          serviceKey,
          email,
        );

        if (profileId) {
          const siteName = `${owner}-${repoName}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 38);

          const { siteName: finalSiteName } = await getOrCreateDecoSite(
            supabaseUrl,
            serviceKey,
            {
              siteName,
              profileId,
              repoOwner: owner!,
              repoName: repoName!,
              installationId,
            },
          );
          decoSiteName = finalSiteName;

          const apiKey = await getOrCreateDecoApiKey(
            supabaseUrl,
            serviceKey,
            profileId,
          );

          const fetchResult = await fetchToolsFromMCP({
            id: `pending-${adminConnId}`,
            title: `deco.cx — ${finalSiteName}`,
            connection_type: "HTTP",
            connection_url: ADMIN_MCP,
            connection_token: apiKey,
          }).catch(() => null);
          const tools = fetchResult?.tools?.length ? fetchResult.tools : null;
          const configuration_scopes = fetchResult?.scopes?.length
            ? fetchResult.scopes
            : null;

          const adminConn = await ctx.storage.connections.create({
            id: adminConnId,
            organization_id: orgId,
            created_by: userId,
            title: `deco.cx — ${finalSiteName}`,
            description: `Admin MCP for deco.cx site: ${finalSiteName}`,
            connection_type: "HTTP",
            connection_url: ADMIN_MCP,
            connection_token: apiKey,
            connection_headers: null,
            oauth_config: null,
            configuration_state: { SITE_NAME: finalSiteName },
            metadata: { source: "github-import-deco" },
            icon: null,
            app_name: "deco.cx",
            app_id: null,
            tools,
            configuration_scopes,
          });

          createdAdminConnId = adminConn.id;
        }
      } catch (err) {
        console.warn(
          "[github-repos] deco.cx site/admin-mcp creation failed (non-fatal):",
          err,
        );
      }
    }

    return c.json({
      connId: connection.id,
      adminConnId: createdAdminConnId,
      decoSiteName,
    });
  } catch (err) {
    console.error("[github-repos] POST /connection error:", err);
    return c.json({ error: "Failed to create connection" }, 500);
  }
});

export default app;
