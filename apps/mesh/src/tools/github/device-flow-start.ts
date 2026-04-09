/**
 * GITHUB_DEVICE_FLOW_START Tool
 *
 * Starts GitHub Device Flow authentication.
 * App-only tool — not visible to AI models.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

// Deco CMS GitHub App client ID (public, safe to hardcode)
const GITHUB_CLIENT_ID = "Iv23liLNDj260RBdPV7p";

export const GITHUB_DEVICE_FLOW_START = defineTool({
  name: "GITHUB_DEVICE_FLOW_START",
  description: "Start GitHub Device Flow authentication to get a user code.",
  annotations: {
    title: "Start GitHub Device Flow",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({}),
  outputSchema: z.object({
    userCode: z.string(),
    verificationUri: z.string(),
    deviceCode: z.string(),
    expiresIn: z.number(),
    interval: z.number(),
  }),

  handler: async (_input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: "",
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub Device Flow error: ${response.status}`);
    }

    const data = (await response.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    };

    return {
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      deviceCode: data.device_code,
      expiresIn: data.expires_in,
      interval: data.interval,
    };
  },
});
