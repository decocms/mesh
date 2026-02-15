/**
 * Branch API helpers
 *
 * Client-side branch lifecycle operations using SITE_BINDING tools
 * (CREATE_BRANCH, LIST_BRANCHES, MERGE_BRANCH, DELETE_BRANCH).
 * All functions gracefully degrade if branch tools are not supported by the MCP.
 */

import type { TypedToolCaller } from "@decocms/bindings";
import type { SiteBinding } from "@decocms/bindings/site";
import { DRAFT_BRANCH_PREFIX } from "../../shared";

type ToolCaller = TypedToolCaller<SiteBinding>;

export interface BranchInfo {
  name: string;
  isDefault: boolean;
}

/**
 * List all branches for the site.
 * Returns null if branch tools are not supported.
 */
export async function listBranches(
  toolCaller: ToolCaller,
): Promise<{ branches: BranchInfo[] } | null> {
  try {
    const result = await toolCaller("LIST_BRANCHES", {});
    return { branches: result.branches };
  } catch {
    return null;
  }
}

/**
 * Create a new draft branch.
 * Automatically prepends the draft/ prefix to the name.
 * Returns null if branch tools are not supported.
 */
export async function createBranch(
  toolCaller: ToolCaller,
  name: string,
  from?: string,
): Promise<{ success: boolean; branch: string } | null> {
  try {
    const branchName = name.startsWith(DRAFT_BRANCH_PREFIX)
      ? name
      : `${DRAFT_BRANCH_PREFIX}${name}`;
    const result = await toolCaller("CREATE_BRANCH", {
      name: branchName,
      from,
    });
    return { success: result.success, branch: result.branch };
  } catch {
    return null;
  }
}

/**
 * Merge a source branch into a target branch.
 * Returns null if branch tools are not supported.
 */
export async function mergeBranch(
  toolCaller: ToolCaller,
  source: string,
  target?: string,
  deleteSource?: boolean,
): Promise<{ success: boolean; message?: string } | null> {
  try {
    const result = await toolCaller("MERGE_BRANCH", {
      source,
      target,
      deleteSource,
    });
    return { success: result.success, message: result.message };
  } catch {
    return null;
  }
}

/**
 * Delete a branch.
 * Returns null if branch tools are not supported.
 */
export async function deleteBranch(
  toolCaller: ToolCaller,
  name: string,
): Promise<{ success: boolean } | null> {
  try {
    const result = await toolCaller("DELETE_BRANCH", { name });
    return { success: result.success };
  } catch {
    return null;
  }
}
