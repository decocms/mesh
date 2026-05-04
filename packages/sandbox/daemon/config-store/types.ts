import type {
  ApplicationIntent,
  PackageManagerConfig,
  RuntimeName,
  TenantConfig,
} from "../types";

/**
 * The single highest-impact transition produced by classifying (before, after).
 * Reducer recipes live in setup/orchestrator.ts.
 */
export type Transition =
  | { kind: "first-bootstrap"; config: TenantConfig }
  | { kind: "resume"; config: TenantConfig }
  | { kind: "branch-change"; from: string | undefined; to: string }
  | {
      kind: "pm-change";
      from: PackageManagerConfig | undefined;
      to: PackageManagerConfig;
    }
  | { kind: "runtime-change"; from: RuntimeName | undefined; to: RuntimeName }
  | {
      kind: "desired-port-change";
      from: number | undefined;
      to: number | undefined;
    }
  | {
      kind: "intent-change";
      from: ApplicationIntent | undefined;
      to: ApplicationIntent;
    }
  | { kind: "proxy-retarget"; port: number }
  | { kind: "identity-conflict"; field: "cloneUrl" }
  | { kind: "no-op" };

export interface ApplyEvent {
  before: TenantConfig | null;
  after: TenantConfig;
  transition: Transition;
}

export const REJECTION_REASONS = {
  INVALID: "invalid",
  IMMUTABLE: "immutable",
  PERSISTENCE_FAILED: "persistence failed",
  APPLY_FAILED: "apply failed",
} as const;

export type RejectionReason =
  (typeof REJECTION_REASONS)[keyof typeof REJECTION_REASONS];

export type ApplyResult =
  | {
      kind: "applied";
      before: TenantConfig | null;
      after: TenantConfig;
      transition: Transition;
    }
  | { kind: "rejected"; reason: RejectionReason; detail?: string };
