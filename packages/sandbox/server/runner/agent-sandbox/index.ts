// Re-exported so external tooling (e.g. deploy/k8s-sandbox/local/smoke.ts)
// can build a KubeConfig without declaring @kubernetes/client-node itself.
export { KubeConfig } from "@kubernetes/client-node";
export { K8S_CONSTANTS, SandboxError, SandboxTimeoutError } from "./constants";
export {
  createSandboxClaim,
  deleteSandboxClaim,
  getSandboxClaim,
  waitForSandboxReady,
} from "./client";
export type {
  SandboxClaim,
  SandboxClaimEnvVar,
  SandboxCondition,
  SandboxResource,
  WaitForSandboxReadyResult,
} from "./client";
export { AgentSandboxRunner, HANDLE_PREFIX } from "./runner";
export type { AgentSandboxRunnerOptions } from "./runner";
