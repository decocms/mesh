/**
 * FILESYSTEM_READ_TUNNEL_CONFIG Tool
 *
 * Reads wrangler.toml from a project directory, computes the deterministic
 * tunnel URL (matching the CLI's algorithm), and checks if it's reachable
 * server-side (avoiding CORS issues).
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

/**
 * Compute the deterministic tunnel domain for a workspace+app pair.
 * Mirrors the algorithm in packages/cli/src/lib/config.ts (getAppDomain).
 */
function computeTunnelDomain(workspace: string, app: string): string {
  const hash = createHash("sha1")
    .update(`${workspace}-${app}`)
    .digest("hex")
    .slice(0, 8);
  return `localhost-${hash}.deco.host`;
}

const InputSchema = z.object({
  path: z.string().describe("Absolute path to project directory"),
});

const OutputSchema = z.object({
  tunnelUrl: z.string().nullable(),
  workspace: z.string().nullable(),
  app: z.string().nullable(),
  reachable: z.boolean(),
});

export const FILESYSTEM_READ_TUNNEL_CONFIG = defineTool({
  name: "FILESYSTEM_READ_TUNNEL_CONFIG",
  description:
    "Read wrangler.toml from a project directory, compute the tunnel URL, and check if it's reachable",
  annotations: {
    title: "Read Tunnel Config",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: async (input, ctx) => {
    await ctx.access.check();
    requireAuth(ctx);

    const nullResult = {
      tunnelUrl: null,
      workspace: null,
      app: null,
      reachable: false,
    };

    // Try to read wrangler.toml
    let raw: string;
    try {
      raw = await readFile(join(input.path, "wrangler.toml"), "utf-8");
    } catch {
      return nullResult;
    }

    // Parse TOML
    let config: Record<string, unknown>;
    try {
      const { parse } = await import("smol-toml");
      config = parse(raw) as Record<string, unknown>;
    } catch {
      return nullResult;
    }

    // Extract workspace and app name
    const deco = config.deco as Record<string, unknown> | undefined;
    const workspace =
      typeof deco?.workspace === "string" ? deco.workspace : null;
    const app = typeof config.name === "string" ? config.name : null;

    if (!workspace) {
      return nullResult;
    }

    // Compute tunnel URL
    const tunnelUrl = `https://${computeTunnelDomain(workspace, app ?? "my-app")}`;

    // Check reachability server-side (avoids CORS)
    let reachable = false;
    try {
      await fetch(tunnelUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      reachable = true;
    } catch {
      reachable = false;
    }

    return { tunnelUrl, workspace, app, reachable };
  },
});
