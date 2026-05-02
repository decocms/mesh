import { TenantConfig } from "./types";

const VALID_RUNTIMES = new Set(["node", "bun", "deno"]);
const VALID_PMS = new Set(["npm", "pnpm", "yarn", "bun", "deno"]);
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;

export type ValidationError = { kind: "invalid"; reason: string };
export type ValidationOk = { kind: "ok" };
export type ValidationResult = ValidationOk | ValidationError;

/**
 * Validate fields that are accepted on BOTH POST /bootstrap and PUT /config —
 * everything except identity (cloneUrl/git*). Identity validation lives in
 * the bootstrap handler since it's first-time-only.
 */
export function validateMutableFields(
  payload: Partial<TenantConfig>,
): ValidationResult {
  if (
    payload.application?.runtime?.name !== undefined &&
    !VALID_RUNTIMES.has(payload.application?.runtime?.name as string)
  ) {
    return {
      kind: "invalid",
      reason: `runtime invalid: ${payload.application?.runtime?.name}`,
    };
  }
  if (
    payload.application?.packageManager?.name !== undefined &&
    !VALID_PMS.has(payload.application?.packageManager?.name as string)
  ) {
    return {
      kind: "invalid",
      reason: `packageManager invalid: ${payload.application?.packageManager?.name}`,
    };
  }
  if (payload.git?.repository?.branch !== undefined) {
    if (
      typeof payload.git?.repository?.branch !== "string" ||
      !BRANCH_RE.test(payload.git?.repository?.branch) ||
      payload.git?.repository?.branch.startsWith("-")
    ) {
      return {
        kind: "invalid",
        reason: `branch invalid: ${payload.git?.repository?.branch}`,
      };
    }
  }
  if (payload.application?.developmentServer?.port !== undefined) {
    if (
      typeof payload.application?.developmentServer?.port !== "number" ||
      !Number.isInteger(payload.application?.developmentServer?.port) ||
      payload.application?.developmentServer?.port <= 0 ||
      payload.application?.developmentServer?.port > 65535
    ) {
      return {
        kind: "invalid",
        reason: `devPort invalid: ${payload.application?.developmentServer?.port}`,
      };
    }
  }
  return { kind: "ok" };
}
