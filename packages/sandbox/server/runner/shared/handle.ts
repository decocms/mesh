import { createHash } from "node:crypto";
import { sandboxIdKey, type SandboxId } from "../types";

const SLUG_MAX = 24;
const HANDLE_HASH_LEN = 5;

/** Stable short hash of a SandboxId. Length in hex chars (default 16). */
export function hashSandboxId(id: SandboxId, length = 16): string {
  return createHash("sha256")
    .update(sandboxIdKey(id))
    .digest("hex")
    .slice(0, length);
}

/**
 * Human-readable URL handle for a sandbox: `<slug>-<hash5>`, where `slug` is
 * derived from the last `/`-segment of the branch and `hash5` is the first
 * 5 hex chars of `SHA256(userId:projectRef)`. Falls back to a bare 5-char
 * hash when the branch is missing or sanitizes to empty.
 *
 * Total max length: 24 + 1 + 5 = 30 chars (under the 63-char DNS label cap).
 */
export function computeHandle(id: SandboxId, branch?: string | null): string {
  const hash = hashSandboxId(id, HANDLE_HASH_LEN);
  const slug = slugifyBranch(branch);
  return slug ? `${slug}-${hash}` : hash;
}

function slugifyBranch(branch: string | null | undefined): string {
  if (!branch) return "";
  const lastSegment = branch.split("/").pop() ?? "";
  return lastSegment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}
