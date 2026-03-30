/**
 * Deco Sites API Route
 *
 * Returns the list of deco.cx sites the authenticated user has access to,
 * and provides a server-side connection-creation endpoint so the deco.cx
 * API key is never forwarded to the browser.
 *
 * Required env vars:
 *   DECO_SUPABASE_URL          – Supabase project URL (e.g. https://xxx.supabase.co)
 *   DECO_SUPABASE_SERVICE_KEY  – Supabase service role key
 */

import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import { getUserId } from "../../core/mesh-context";
import { fetchToolsFromMCP } from "../../tools/connection/fetch-tools";
import {
  ADMIN_MCP,
  getSupabaseConfig,
  supabaseGet,
  resolveProfileId,
  getOrCreateDecoApiKey,
} from "./deco-supabase";

type Variables = { meshContext: MeshContext };

const app = new Hono<{ Variables: Variables }>();

interface SupabaseSite {
  name: string;
  domains: { domain: string; production: boolean }[] | null;
  thumb_url: string | null;
}

// Require an authenticated user on every handler in this router.
app.use("*", async (c, next) => {
  const ctx = c.get("meshContext");
  if (!ctx.auth.user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

/**
 * GET /api/deco-sites/profile
 *
 * Lightweight check: returns whether the authenticated user has a deco.cx profile.
 * Used to conditionally show deco.cx onboarding UI without fetching all sites.
 */
app.get("/profile", async (c) => {
  const ctx = c.get("meshContext");
  const email = ctx.auth.user?.email;
  if (!email) return c.json({ error: "Unauthorized" }, 401);

  const config = getSupabaseConfig();
  if (!config) return c.json({ isDecoUser: false });

  try {
    const profileId = await resolveProfileId(
      config.supabaseUrl,
      config.serviceKey,
      email,
    );
    return c.json({ isDecoUser: profileId !== null });
  } catch {
    return c.json({ isDecoUser: false });
  }
});

/**
 * GET /api/deco-sites
 *
 * Returns deco.cx sites belonging to the authenticated user.
 * The deco.cx API key is intentionally NOT returned — it remains server-side.
 */
app.get("/", async (c) => {
  const ctx = c.get("meshContext");

  const email = ctx.auth.user?.email;
  if (!email) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const config = getSupabaseConfig();
  if (!config) {
    return c.json({ sites: [] });
  }
  const { supabaseUrl, serviceKey } = config;

  try {
    const profileId = await resolveProfileId(supabaseUrl, serviceKey, email);
    if (!profileId) {
      return c.json({ sites: [] });
    }

    const members = await supabaseGet<{ team_id: number }>(
      supabaseUrl,
      serviceKey,
      `members?user_id=eq.${encodeURIComponent(profileId)}&deleted_at=is.null&select=team_id`,
    );

    // Guard: only allow integer team IDs to prevent query injection.
    const teamIds = members
      .map((m) => m.team_id)
      .filter((id): id is number => Number.isInteger(id));

    if (teamIds.length === 0) {
      return c.json({ sites: [] });
    }

    const sites = await supabaseGet<SupabaseSite>(
      supabaseUrl,
      serviceKey,
      `sites?team=in.(${teamIds.join(",")})&select=name,domains,thumb_url&order=id`,
    );

    return c.json({ sites });
  } catch (err) {
    console.error("[deco-sites] GET error:", err);
    return c.json({ error: "Failed to fetch sites" }, 502);
  }
});

async function fetchFaviconAsDataUrl(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${domain}/favicon.ico`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/x-icon";
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * POST /api/deco-sites/connection
 *
 * Creates the deco.cx MCP connection server-side so the API key never reaches
 * the browser. The caller supplies a pre-generated connId so subsequent
 * project-linking tool calls can reference it without an extra round-trip.
 */
app.post("/connection", async (c) => {
  const ctx = c.get("meshContext");

  const email = ctx.auth.user?.email;
  const userId = getUserId(ctx);
  if (!email || !userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: { siteName: string; connId: string; orgId: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const { siteName, connId, orgId } = body;
  if (!siteName || !connId || !orgId) {
    return c.json({ error: "siteName, connId, and orgId are required" }, 400);
  }

  // Validate siteName is a safe DNS subdomain label to prevent SSRF.
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(siteName)) {
    return c.json({ error: "Invalid siteName" }, 400);
  }

  const membership = await ctx.db
    .selectFrom("member")
    .select("member.id")
    .where("member.userId", "=", userId)
    .where("member.organizationId", "=", orgId)
    .executeTakeFirst();

  if (!membership) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const config = getSupabaseConfig();
  if (!config) {
    return c.json({ error: "Deco integration is not configured" }, 503);
  }
  const { supabaseUrl, serviceKey } = config;

  try {
    const profileId = await resolveProfileId(supabaseUrl, serviceKey, email);
    if (!profileId) {
      return c.json({ error: "No deco.cx account found for this user" }, 404);
    }

    const apiKey = await getOrCreateDecoApiKey(
      supabaseUrl,
      serviceKey,
      profileId,
    );

    // Fetch tools and scopes from the MCP server before storing, mirroring
    // what COLLECTION_CONNECTIONS_CREATE does so the tools list isn't empty.
    const fetchResult = await fetchToolsFromMCP({
      id: `pending-${connId}`,
      title: `deco.cx — ${siteName}`,
      connection_type: "HTTP",
      connection_url: ADMIN_MCP,
      connection_token: apiKey,
    }).catch(() => null);
    const tools = fetchResult?.tools?.length ? fetchResult.tools : null;
    const configuration_scopes = fetchResult?.scopes?.length
      ? fetchResult.scopes
      : null;

    // Fetch the favicon server-side to avoid CORS issues.
    // Returned to the caller so it can be set as the project icon.
    const faviconIcon = await fetchFaviconAsDataUrl(`${siteName}.deco.site`);

    // Store the connection with the API key encrypted by the vault.
    // The key is never serialised into any response body.
    const connection = await ctx.storage.connections.create({
      id: connId,
      organization_id: orgId,
      created_by: userId,
      title: `deco.cx — ${siteName}`,
      description: `Admin MCP for deco.cx site: ${siteName}`,
      connection_type: "HTTP",
      connection_url: ADMIN_MCP,
      connection_token: apiKey,
      connection_headers: null,
      oauth_config: null,
      configuration_state: {
        SITE_NAME: siteName,
      },
      metadata: { source: "deco.cx-import" },
      icon: null,
      app_name: "deco.cx",
      app_id: null,
      tools,
      configuration_scopes,
    });

    return c.json({ connId: connection.id, icon: faviconIcon });
  } catch (err) {
    console.error("[deco-sites] POST /connection error:", err);
    return c.json({ error: "Failed to create connection" }, 500);
  }
});

export default app;
