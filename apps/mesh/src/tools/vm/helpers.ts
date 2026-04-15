/**
 * Shared VM helper functions used across VM tools (VM_START, VM_DELETE).
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
import { PACKAGE_MANAGER_CONFIG } from "../../shared/runtime-defaults";
import type { PackageManager } from "../../shared/runtime-defaults";
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
  const virtualMcp = await ctx.storage.virtualMcps.findById(
    input.virtualMcpId,
  );
  if (!virtualMcp || virtualMcp.organization_id !== organization.id) {
    throw new Error("Virtual MCP not found");
  }
  const metadata = virtualMcp.metadata as VmMetadata;
  const entry = metadata.activeVms?.[userId];
  return { virtualMcp, metadata, userId, entry, organization };
}

/**
 * Resolves package manager and runtime config from Virtual MCP metadata.
 * Returns null packageManager/runtime when no package manager is selected
 * (clone-only mode for non-JS repos).
 */
export function resolveRuntimeConfig(metadata: VmMetadata) {
  const selected = metadata.runtime?.selected ?? null;
  const pm = selected as PackageManager | null;

  if (!pm || !(pm in PACKAGE_MANAGER_CONFIG)) {
    return {
      packageManager: null,
      runtime: null,
      port: metadata.runtime?.port ?? "3000",
      runtimeBinPath: null,
    };
  }

  const runtime = PACKAGE_MANAGER_CONFIG[pm].runtime;
  const runtimeBinPath =
    runtime === "deno"
      ? "/opt/deno/bin"
      : runtime === "bun"
        ? "/opt/bun/bin"
        : null;

  return {
    packageManager: pm,
    runtime,
    port: metadata.runtime?.port ?? "3000",
    runtimeBinPath,
  };
}
