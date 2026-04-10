import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { MeshContext } from "../../core/mesh-context";
import type { VmEntry, VmMetadata } from "./types";

// ---------------------------------------------------------------------------
// Mock freestyle-sandboxes BEFORE importing VM_EXEC (Bun requires this order)
// ---------------------------------------------------------------------------

const mockVmExec = mock(
  (_command: unknown): Promise<void> => Promise.resolve(),
);

const mockVmsRef = mock((_input: { vmId: string }) => ({
  exec: (command: unknown) => mockVmExec(command),
}));

mock.module("freestyle-sandboxes", () => ({
  freestyle: {
    vms: {
      ref: (input: { vmId: string }) => mockVmsRef(input),
    },
  },
}));

// Now import after mocking
const { VM_EXEC } = await import("./exec");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_METADATA: VmMetadata = {
  githubRepo: {
    url: "https://github.com/acme/app",
    owner: "acme",
    name: "app",
  },
  runtime: {
    detected: "npm",
    selected: "npm",
    installScript: "npm install",
    devScript: "npm run dev",
    port: "3000",
  },
};

const EXISTING_ENTRY: VmEntry = {
  vmId: "vm_existing",
  previewUrl: "https://vmcp-1.deco.studio",
  terminalUrl: "https://vmcp-1-term.deco.studio",
};

function makeVirtualMcp(orgId: string, metadata: VmMetadata, id = "vmcp_1") {
  return {
    id,
    organization_id: orgId,
    metadata,
    title: "Test Virtual MCP",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: "user_1",
  };
}

function makeCtx(overrides: {
  orgId?: string;
  userId?: string;
  virtualMcp?: ReturnType<typeof makeVirtualMcp> | null;
}): MeshContext {
  const { orgId = "org_1", userId = "user_1", virtualMcp } = overrides;

  const findById = mock(async (_id: string) => virtualMcp ?? null);

  return {
    auth: {
      user: {
        id: userId,
        email: "[email protected]",
        name: "Test",
        role: "user",
      },
    },
    organization: { id: orgId, slug: "test-org", name: "Test Org" },
    access: {
      granted: () => true,
      check: async () => {},
      grant: () => {},
      setToolName: () => {},
    },
    storage: {
      virtualMcps: {
        findById,
      },
    } as never,
    timings: {
      measure: async <T>(_name: string, cb: () => Promise<T>) => await cb(),
    },
    vault: null as never,
    authInstance: null as never,
    boundAuth: null as never,
    db: null as never,
    tracer: {
      startActiveSpan: (
        _name: string,
        _opts: unknown,
        fn: (span: unknown) => unknown,
      ) =>
        fn({
          setStatus: () => {},
          recordException: () => {},
          end: () => {},
        }),
    } as never,
    meter: {
      createHistogram: () => ({ record: () => {} }),
      createCounter: () => ({ add: () => {} }),
    } as never,
    baseUrl: "https://mesh.example.com",
    metadata: { requestId: "req_1", timestamp: new Date() },
    eventBus: null as never,
    objectStorage: null as never,
    aiProviders: null as never,
    createMCPProxy: null as never,
    getOrCreateClient: null as never,
    pendingRevalidations: [],
    monitoring: null as never,
  } as unknown as MeshContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VM_EXEC", () => {
  beforeEach(() => {
    mockVmExec.mockReset();
    mockVmsRef.mockReset();
    mockVmExec.mockImplementation(async () => {});
    mockVmsRef.mockImplementation((_input: { vmId: string }) => ({
      exec: (command: unknown) => mockVmExec(command),
    }));
  });

  it("install action calls vm.exec with install commands and returns { success: true }", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { user_1: EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    const result = await VM_EXEC.handler(
      { virtualMcpId: "vmcp_1", action: "install" },
      ctx,
    );

    expect(result).toEqual({ success: true });
    expect(mockVmsRef).toHaveBeenCalledWith({ vmId: EXISTING_ENTRY.vmId });
    // Single nohup fire-and-forget call that runs install in background
    expect(mockVmExec.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("dev action calls vm.exec with nohup dev command and returns { success: true }", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { user_1: EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    const result = await VM_EXEC.handler(
      { virtualMcpId: "vmcp_1", action: "dev" },
      ctx,
    );

    expect(result).toEqual({ success: true });
    expect(mockVmsRef).toHaveBeenCalledWith({ vmId: EXISTING_ENTRY.vmId });

    // Find the nohup dev server call
    const calls = mockVmExec.mock.calls as unknown[][];
    const nohupCall = calls.find((args) => {
      const cmd = args[0];
      if (typeof cmd === "object" && cmd !== null && "command" in cmd) {
        return (cmd as { command: string }).command.includes("nohup bash -c");
      }
      return false;
    });
    expect(nohupCall).toBeDefined();
    const nohupCmd = nohupCall![0] as { command: string };
    expect(nohupCmd.command).toContain("npm run dev");
    expect(nohupCmd.command).toContain("PORT=3000");
  });

  it("throws when no active VM entry exists for current user", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { other_user: EXISTING_ENTRY }, // no entry for user_1
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    await expect(
      VM_EXEC.handler({ virtualMcpId: "vmcp_1", action: "install" }, ctx),
    ).rejects.toThrow("No active VM found. Start a VM first.");
  });

  it("returns { success: false, error } when vm.exec fails", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { user_1: EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    mockVmExec.mockImplementation(async () => {
      throw new Error("exec failed: timeout");
    });

    const result = await VM_EXEC.handler(
      { virtualMcpId: "vmcp_1", action: "install" },
      ctx,
    );

    expect(result).toEqual({ success: false, error: "exec failed: timeout" });
  });

  it("install action with deno runtime runs deno install without curl setup", async () => {
    const denoMetadata: VmMetadata = {
      githubRepo: BASE_METADATA.githubRepo,
      runtime: {
        detected: "deno",
        selected: "deno",
        installScript: "deno install",
        devScript: "deno task dev",
        port: "8000",
      },
      activeVms: { user_1: EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", denoMetadata);
    const ctx = makeCtx({ virtualMcp });

    const result = await VM_EXEC.handler(
      { virtualMcpId: "vmcp_1", action: "install" },
      ctx,
    );

    expect(result).toEqual({ success: true });

    // Verify no curl install script — runtime is pre-installed via Freestyle integrations
    const calls = mockVmExec.mock.calls as unknown[][];
    const curlCall = calls.find((args) => {
      const cmd = args[0];
      if (typeof cmd === "object" && cmd !== null && "command" in cmd) {
        return (cmd as { command: string }).command.includes("curl");
      }
      return false;
    });
    expect(curlCall).toBeUndefined();

    // Verify deno install is called
    const installCall = calls.find((args) => {
      const cmd = args[0];
      if (typeof cmd === "object" && cmd !== null && "command" in cmd) {
        return (cmd as { command: string }).command.includes("deno install");
      }
      return false;
    });
    expect(installCall).toBeDefined();
  });
});
