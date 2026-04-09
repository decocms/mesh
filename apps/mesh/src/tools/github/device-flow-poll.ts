/**
 * GITHUB_DEVICE_FLOW_POLL Tool
 *
 * Polls GitHub Device Flow for access token.
 * App-only tool — not visible to AI models.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

const GITHUB_CLIENT_ID = "Iv23liLNDj260RBdPV7p";

export const GITHUB_DEVICE_FLOW_POLL = defineTool({
  name: "GITHUB_DEVICE_FLOW_POLL",
  description: "Poll GitHub Device Flow for the access token.",
  annotations: {
    title: "Poll GitHub Device Flow",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    deviceCode: z.string().describe("Device code from the start step"),
  }),
  outputSchema: z.object({
    status: z.enum(["pending", "success", "expired", "error"]),
    token: z.string().nullable(),
    error: z.string().nullable(),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: input.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      },
    );

    if (!response.ok) {
      return {
        status: "error" as const,
        token: null,
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.access_token) {
      return {
        status: "success" as const,
        token: data.access_token,
        error: null,
      };
    }

    if (data.error === "authorization_pending" || data.error === "slow_down") {
      return { status: "pending" as const, token: null, error: null };
    }

    if (data.error === "expired_token") {
      return {
        status: "expired" as const,
        token: null,
        error: "Device code expired",
      };
    }

    return {
      status: "error" as const,
      token: null,
      error: data.error_description ?? data.error ?? "Unknown error",
    };
  },
});
