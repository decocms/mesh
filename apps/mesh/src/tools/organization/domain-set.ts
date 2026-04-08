/**
 * ORGANIZATION_DOMAIN_SET Tool
 *
 * Set or update the domain claim for an organization
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { GENERIC_EMAIL_DOMAINS } from "../../auth";

const DOMAIN_REGEX =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const ORGANIZATION_DOMAIN_SET = defineTool({
  name: "ORGANIZATION_DOMAIN_SET",
  description:
    "Set or update the claimed email domain for an organization. Users with matching email can auto-join.",
  annotations: {
    title: "Set Organization Domain",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object({
    domain: z
      .string()
      .min(1)
      .max(255)
      .describe("Email domain to claim (e.g. 'acme.com')"),
    autoJoinEnabled: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether users with matching email domain can auto-join"),
  }),
  outputSchema: z.object({
    domain: z.string(),
    autoJoinEnabled: z.boolean(),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const org = requireOrganization(ctx);
    const domain = input.domain.toLowerCase().trim();

    // Validate domain format
    if (!DOMAIN_REGEX.test(domain)) {
      throw new Error(
        `Invalid domain format: "${domain}". Must be a valid domain like "acme.com"`,
      );
    }

    // Reject generic email domains
    if (GENERIC_EMAIL_DOMAINS.has(domain)) {
      throw new Error(
        `Cannot claim generic email domain "${domain}". Only corporate domains are allowed.`,
      );
    }

    // setDomain handles the domain uniqueness constraint atomically —
    // it will throw if another org already claimed this domain.
    const result = await ctx.storage.organizationDomains.setDomain(
      org.id,
      domain,
      input.autoJoinEnabled,
    );

    return {
      domain: result.domain,
      autoJoinEnabled: result.autoJoinEnabled,
    };
  },
});

export const ORGANIZATION_DOMAIN_CLEAR = defineTool({
  name: "ORGANIZATION_DOMAIN_CLEAR",
  description: "Remove the claimed email domain for an organization.",
  annotations: {
    title: "Clear Organization Domain",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
  }),

  handler: async (_input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const org = requireOrganization(ctx);
    await ctx.storage.organizationDomains.clearDomain(org.id);

    return { success: true };
  },
});
