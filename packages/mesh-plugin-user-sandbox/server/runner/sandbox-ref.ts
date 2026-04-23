/**
 * Sandbox routing key (`projectRef`) composer.
 *
 * Two encodings, both opaque to runners:
 *   `agent:<orgId>:<virtualMcpId>:<branch>` — agent-thread sandboxes.
 *   `thread:<threadId>` — non-agent ad-hoc sandboxes.
 *
 * Single source of truth for the encoding so callers can't drift. Runners
 * never parse the ref; they hash it for their internal routing key
 * (`hashId` in DockerSandboxRunner, claim name suffix for Kubernetes).
 */

export type AgentSandboxRefInput = {
  orgId: string;
  virtualMcpId: string;
  branch: string;
};

export type ThreadSandboxRefInput = { threadId: string };

export type SandboxRefInput = AgentSandboxRefInput | ThreadSandboxRefInput;

export function composeSandboxRef(input: SandboxRefInput): string {
  if ("threadId" in input) {
    if (!input.threadId)
      throw new Error("composeSandboxRef: threadId required");
    return `thread:${input.threadId}`;
  }
  if (!input.orgId || !input.virtualMcpId || !input.branch) {
    throw new Error(
      "composeSandboxRef: orgId, virtualMcpId and branch are all required for agent refs",
    );
  }
  return `agent:${input.orgId}:${input.virtualMcpId}:${input.branch}`;
}
