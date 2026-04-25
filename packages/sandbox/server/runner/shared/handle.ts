import { createHash } from "node:crypto";
import { sandboxIdKey, type SandboxId } from "../types";

/** Stable short hash of a SandboxId. Length in hex chars (default 16). */
export function hashSandboxId(id: SandboxId, length = 16): string {
  return createHash("sha256")
    .update(sandboxIdKey(id))
    .digest("hex")
    .slice(0, length);
}
