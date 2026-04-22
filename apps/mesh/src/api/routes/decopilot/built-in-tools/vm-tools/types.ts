/**
 * Shared types for VM tool factories. Each runner implementation consumes
 * `CommonParams` plus its own transport-specific fields. The `VmToolsParams`
 * discriminated union is what the dispatch (`index.ts`) accepts — kind is
 * resolved at registry-build time.
 */

import type { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";

/**
 * Fields every VM tool factory needs regardless of transport.
 */
export interface CommonParams {
  readonly toolOutputMap: Map<string, string>;
  /**
   * Approval gate for mutating tools (write/edit/bash). Read-only tools
   * (read/grep/glob) bypass this.
   */
  readonly needsApproval: boolean;
}

export interface FreestyleVmToolsParams extends CommonParams {
  readonly runner: "freestyle";
  readonly vmBaseUrl: string;
}

export interface DockerVmToolsParams extends CommonParams {
  readonly runner: "docker";
  readonly dockerRunner: DockerSandboxRunner;
  readonly handle: string;
}

export type VmToolsParams = FreestyleVmToolsParams | DockerVmToolsParams;
