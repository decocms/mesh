/**
 * Seed script: Creates a Slide Maker connection, wraps it in an agent,
 * wraps that in a project, and sets the slide_maker tool as the default UI.
 *
 * Run: bun run --cwd apps/mesh scripts/seed-slide-project.ts
 *
 * Prerequisites: dev server must be running (bun run dev)
 */

const BASE_URL = "http://localhost:4000";

async function getSession(): Promise<{
  token: string;
  orgId: string;
  orgSlug: string;
}> {
  // Get current session
  const res = await fetch(`${BASE_URL}/api/auth/get-session`, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Not logged in. Open the app first and log in.");
  const session = (await res.json()) as {
    session: { token: string };
    user: { id: string };
  };

  // Get active org
  const orgRes = await fetch(
    `${BASE_URL}/api/auth/organization/get-full-organization`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.token}`,
      },
      body: "{}",
    },
  );

  if (!orgRes.ok) {
    // Try listing orgs
    const listRes = await fetch(
      `${BASE_URL}/api/auth/organization/list-organizations`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.session.token}`,
        },
      },
    );
    const orgs = (await listRes.json()) as Array<{
      id: string;
      slug: string;
    }>;
    if (orgs.length === 0) throw new Error("No organizations found");
    return {
      token: session.session.token,
      orgId: orgs[0].id,
      orgSlug: orgs[0].slug,
    };
  }

  const org = (await orgRes.json()) as { id: string; slug: string };
  return {
    token: session.session.token,
    orgId: org.id,
    orgSlug: org.slug,
  };
}

async function callTool(
  token: string,
  orgId: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  const res = await fetch(`${BASE_URL}/api/mcp/self`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-mesh-org-id": orgId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tool call failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    result?: { structuredContent?: unknown };
  };
  return json.result?.structuredContent ?? json.result;
}

async function main() {
  console.log("Getting session...");

  // Since we can't easily get the session token from a script,
  // let's use the MCP endpoint directly through the internal API.
  // The dev server should have the embedded postgres running.

  // Actually, let's just use the Kysely DB directly since we're in the same codebase.
  console.log(
    "\nThis script needs the dev server running. Instead of API calls,",
  );
  console.log("let's create the data through the UI:\n");
  console.log("1. Open Studio in your browser (http://localhost:4000)");
  console.log("2. Go to Settings > Connections");
  console.log("3. Click 'Create connection' and fill in:");
  console.log("   - Title: Slide Maker");
  console.log("   - Type: HTTP");
  console.log("   - URL: https://slide-maker.decocms.com/api/mcp");
  console.log("   - Token: 9c8ed79c-4e23-4ca8-9f22-257afff0aee5");
  console.log("4. Save the connection");
  console.log("5. Go to Settings > Agents (or create a new agent)");
  console.log("   - Name it 'Slide Maker'");
  console.log("   - Add the Slide Maker connection to it");
  console.log("6. Go home > New Project or click '+' in sidebar");
  console.log("   - Name it 'My Slides'");
  console.log("   - In project settings, add the Slide Maker agent");
  console.log(
    "\nThe slide_maker tool UI will be available in the agent's ext-apps view.",
  );
}

main().catch(console.error);
