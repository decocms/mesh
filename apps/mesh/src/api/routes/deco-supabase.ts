/**
 * Shared Supabase helpers for deco.cx integration.
 *
 * Used by both the deco-sites and github-repos routes to interact
 * with the admin.deco.cx Supabase project (profiles, teams, sites, API keys).
 */

import { getSettings } from "../../settings";

export const ADMIN_MCP = "http://localhost:3001/api/mcp";

export function getSupabaseConfig(): {
  supabaseUrl: string;
  serviceKey: string;
} | null {
  const settings = getSettings();
  const supabaseUrl = settings.decoSupabaseUrl;
  const serviceKey = settings.decoSupabaseServiceKey;
  if (!supabaseUrl || !serviceKey) return null;
  return { supabaseUrl, serviceKey };
}

export async function supabaseGet<T>(
  supabaseUrl: string,
  serviceKey: string,
  path: string,
): Promise<T[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    console.error(`[deco-supabase] Supabase error (${res.status}): ${text}`);
    throw new Error(`External service error (${res.status})`);
  }
  return res.json() as Promise<T[]>;
}

export async function supabasePost<T>(
  supabaseUrl: string,
  serviceKey: string,
  table: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    console.error(
      `[deco-supabase] Supabase POST error (${res.status}): ${text}`,
    );
    throw new Error(`External service error (${res.status})`);
  }
  const rows = (await res.json()) as T[];
  if (!rows[0]) {
    throw new Error("Supabase POST returned no rows");
  }
  return rows[0];
}

export async function resolveProfileId(
  supabaseUrl: string,
  serviceKey: string,
  email: string,
): Promise<string | null> {
  const profiles = await supabaseGet<{ user_id: string }>(
    supabaseUrl,
    serviceKey,
    `profiles?email=eq.${encodeURIComponent(email)}&select=user_id`,
  );
  return profiles[0]?.user_id ?? null;
}

export async function getOrCreateDecoApiKey(
  supabaseUrl: string,
  serviceKey: string,
  profileId: string,
): Promise<string> {
  const existing = await supabaseGet<{ id: string }>(
    supabaseUrl,
    serviceKey,
    `api_key?user_id=eq.${encodeURIComponent(profileId)}&select=id&limit=1`,
  );
  if (existing[0]?.id) {
    return existing[0].id;
  }

  const created = await supabasePost<{ id: string }>(
    supabaseUrl,
    serviceKey,
    "api_key",
    { user_id: profileId },
  );
  return created.id;
}

/**
 * Find or create a deco.cx site by name.
 *
 * If a site with the given name already exists, ensures the user is a member
 * of its team and returns the existing site. Otherwise creates a new team,
 * membership, and site.
 *
 * TODO: In the future, instead of creating a new team per site, allow the
 * user to pick an existing team or use their personal team.
 */
export async function getOrCreateDecoSite(
  supabaseUrl: string,
  serviceKey: string,
  opts: {
    siteName: string;
    profileId: string;
    repoOwner: string;
    repoName: string;
    installationId: string;
  },
): Promise<{ siteId: number; siteName: string }> {
  const { siteName, profileId, repoOwner, repoName, installationId } = opts;

  const existing = await supabaseGet<{
    id: number;
    name: string;
    team: number;
  }>(
    supabaseUrl,
    serviceKey,
    `sites?name=eq.${encodeURIComponent(siteName)}&select=id,name,team`,
  );

  if (existing[0]) {
    const site = existing[0];

    const membership = await supabaseGet<{ id: number }>(
      supabaseUrl,
      serviceKey,
      `members?user_id=eq.${encodeURIComponent(profileId)}&team_id=eq.${site.team}&deleted_at=is.null&select=id&limit=1`,
    );

    if (membership.length === 0) {
      await supabasePost<{ id: number }>(supabaseUrl, serviceKey, "members", {
        user_id: profileId,
        team_id: site.team,
      });
    }

    return { siteId: site.id, siteName: site.name };
  }

  // TODO: Let the user pick an existing team instead of always creating a new one.
  const team = await supabasePost<{ id: number }>(
    supabaseUrl,
    serviceKey,
    "teams",
    {
      name: siteName,
      slug: siteName,
      owner_user_id: profileId,
    },
  );

  const member = await supabasePost<{ id: number }>(
    supabaseUrl,
    serviceKey,
    "members",
    {
      user_id: profileId,
      team_id: team.id,
      admin: true,
    },
  );

  const ADMIN_ROLE_ID = 4;

  await supabasePost<{ id: number }>(supabaseUrl, serviceKey, "member_roles", {
    member_id: member.id,
    role_id: ADMIN_ROLE_ID,
  });

  const site = await supabasePost<{ id: number; name: string }>(
    supabaseUrl,
    serviceKey,
    "sites",
    {
      name: siteName,
      team: team.id,
      domains: [{ domain: `${siteName}.deco.site`, production: true }],
      metadata: {
        adminVersion: 2,
        selfHosting: {
          enabled: true,
          repoName,
          repoOwner,
          connectedAt: new Date().toISOString(),
          githubInstallationId: installationId,
        },
      },
    },
  );

  return { siteId: site.id, siteName: site.name };
}
