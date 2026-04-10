/**
 * Shared VM helper functions used across VM tools (VM_START, VM_EXEC, VM_STOP, VM_PROBE).
 *
 * Centralizes:
 * - Auth + lookup boilerplate (requireVmEntry)
 * - Runtime detection logic (resolveRuntimeConfig)
 */

import {
  requireAuth,
  requireOrganization,
  getUserId,
  type MeshContext,
} from "../../core/mesh-context";
import type { VmMetadata } from "./types";

/**
 * Extracts common auth + lookup boilerplate shared by all VM tools.
 * Validates auth, checks access, fetches and validates the Virtual MCP,
 * and returns the metadata and active VM entry for the current user.
 */
export async function requireVmEntry(
  input: { virtualMcpId: string },
  ctx: MeshContext,
) {
  requireAuth(ctx);
  const organization = requireOrganization(ctx);
  await ctx.access.check();
  const userId = getUserId(ctx);
  if (!userId) throw new Error("User ID required");
  const virtualMcp = await ctx.storage.virtualMcps.findById(input.virtualMcpId);
  if (!virtualMcp || virtualMcp.organization_id !== organization.id) {
    throw new Error("Virtual MCP not found");
  }
  const metadata = virtualMcp.metadata as VmMetadata;
  const entry = metadata.activeVms?.[userId];
  return { virtualMcp, metadata, userId, entry, organization };
}

/**
 * Extracts runtime detection logic from Virtual MCP metadata.
 * Returns normalized runtime config with defaults and a `needsRuntimeInstall`
 * flag for runtimes (deno/bun) that are not pre-installed in Freestyle VMs.
 */
export function resolveRuntimeConfig(metadata: VmMetadata) {
  const installScript = metadata.runtime?.installScript ?? "npm install";
  const devScript = metadata.runtime?.devScript ?? "npm run dev";
  const detected = metadata.runtime?.detected ?? "npm";
  const port = metadata.runtime?.port ?? "3000";
  const needsRuntimeInstall = detected === "deno" || detected === "bun";
  return { installScript, devScript, detected, port, needsRuntimeInstall };
}
