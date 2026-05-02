import type { TenantConfig } from "../types";
import type { Transition } from "./types";

/**
 * Pure: derive the single highest-impact transition between two configs.
 * Identity rules are enforced as `identity-conflict` outcomes — the store
 * uses that to reject the apply before persisting anything.
 *
 * Precedence (highest first):
 *   identity-conflict > first-bootstrap > branch-change >
 *   runtime-change > pm-change > intent-change >
 *   desired-port-change > proxy-retarget > no-op
 */
export function classify(
  before: TenantConfig | null,
  after: TenantConfig,
): Transition {
  // 1. Identity invariants (write-once cloneUrl).
  const beforeUrl = before?.git?.repository?.cloneUrl;
  const afterUrl = after.git?.repository?.cloneUrl;
  if (
    beforeUrl !== undefined &&
    afterUrl !== undefined &&
    beforeUrl !== afterUrl
  ) {
    return { kind: "identity-conflict", field: "cloneUrl" };
  }

  // 2. First-bootstrap: no prior config, but new one carries enough to
  //    drive setup (cloneUrl OR application). Pure null → null is no-op.
  const isMeaningful =
    after.git?.repository?.cloneUrl !== undefined ||
    after.application !== undefined;
  if (before === null && isMeaningful) {
    return { kind: "first-bootstrap", config: after };
  }
  if (before === null) {
    return { kind: "no-op" };
  }

  // 3. Branch change.
  const beforeBranch = before.git?.repository?.branch;
  const afterBranch = after.git?.repository?.branch;
  if (afterBranch !== undefined && beforeBranch !== afterBranch) {
    return { kind: "branch-change", from: beforeBranch, to: afterBranch };
  }

  // 4. Runtime change (independent of pm).
  const beforeRuntime = before.application?.runtime;
  const afterRuntime = after.application?.runtime;
  if (afterRuntime !== undefined && beforeRuntime !== afterRuntime) {
    return { kind: "runtime-change", from: beforeRuntime, to: afterRuntime };
  }

  // 5. Package-manager change (name or path).
  const beforePm = before.application?.packageManager;
  const afterPm = after.application?.packageManager;
  if (
    afterPm !== undefined &&
    (beforePm?.name !== afterPm.name || beforePm?.path !== afterPm.path)
  ) {
    return { kind: "pm-change", from: beforePm, to: afterPm };
  }

  // 6. Intent change (running ↔ paused).
  const beforeIntent = before.application?.intent;
  const afterIntent = after.application?.intent;
  if (afterIntent !== undefined && beforeIntent !== afterIntent) {
    return { kind: "intent-change", from: beforeIntent, to: afterIntent };
  }

  // 7. Desired PORT change.
  const beforeDesired = before.application?.desiredPort;
  const afterDesired = after.application?.desiredPort;
  if (beforeDesired !== afterDesired) {
    return {
      kind: "desired-port-change",
      from: beforeDesired,
      to: afterDesired,
    };
  }

  // 8. Proxy target change (probe writeback or tenant override).
  const beforeProxy = before.application?.proxy?.targetPort;
  const afterProxy = after.application?.proxy?.targetPort;
  if (afterProxy !== undefined && beforeProxy !== afterProxy) {
    return { kind: "proxy-retarget", port: afterProxy };
  }

  return { kind: "no-op" };
}
