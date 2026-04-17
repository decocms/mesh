import { createHash } from "node:crypto";
import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { MeshContext } from "../../core/mesh-context";
import type { VmEntry, VmMetadata } from "./types";

// ---------------------------------------------------------------------------
// Mock freestyle-sandboxes BEFORE importing VM_START (Bun requires this order)
// ---------------------------------------------------------------------------

const mockRoute = mock((): Promise<void> => Promise.resolve());

const mockVmsCreate = mock(
  (
    _input: unknown,
  ): Promise<{
    vmId: string;
    vm: { terminal: { logs: { route: typeof mockRoute } } };
  }> =>
    Promise.resolve({
      vmId: "vm_xyz",
      vm: { terminal: { logs: { route: mockRoute } } },
    }),
);

const mockVmStart = mock((): Promise<void> => Promise.resolve());
const mockVmExec = mock((_input: unknown): Promise<void> => Promise.resolve());

class MockVmSpec {
  builders: Record<string, unknown> = {};
  _files: unknown = undefined;
  _services: Record<string, unknown>[] = [];

  with(key: string, builder: unknown): MockVmSpec {
    const next = Object.assign(new MockVmSpec(), this);
    next.builders = { ...this.builders, [key]: builder };
    return next;
  }
  additionalFiles(files: unknown): MockVmSpec {
    const next = Object.assign(new MockVmSpec(), this);
    next._files = files;
    return next;
  }
  systemdService(svc: Record<string, unknown>): MockVmSpec {
    const next = Object.assign(new MockVmSpec(), this);
    next._services = [...this._services, svc];
    return next;
  }
}

mock.module("freestyle-sandboxes", () => ({
  VmSpec: MockVmSpec,
  freestyle: {
    vms: {
      create: (a: unknown) => mockVmsCreate(a),
      ref: (_input: unknown) => ({
        start: () => mockVmStart(),
        exec: (cmd: unknown) => mockVmExec(cmd),
      }),
    },
  },
}));

// Mock Freestyle integration packages
mock.module("@freestyle-sh/with-nodejs", () => ({
  VmNodeJs: class VmNodeJs {},
}));
mock.module("@freestyle-sh/with-deno", () => ({
  VmDeno: class VmDeno {},
}));
mock.module("@freestyle-sh/with-bun", () => ({
  VmBun: class VmBun {},
}));
// Mock downstream token storage to return a test token
const mockTokenGet = mock(
  async (
    _connectionId: string,
  ): Promise<{
    id: string;
    connectionId: string;
    accessToken: string;
    refreshToken: null;
    scope: null;
    expiresAt: null;
    createdAt: string;
    updatedAt: string;
    clientId: null;
    clientSecret: null;
    tokenEndpoint: null;
  } | null> => ({
    id: "dtok_1",
    connectionId: "conn_github_1",
    accessToken: "ghu_test_token_123",
    refreshToken: null,
    scope: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientId: null,
    clientSecret: null,
    tokenEndpoint: null,
  }),
);

mock.module("../../storage/downstream-token", () => ({
  DownstreamTokenStorage: class MockDownstreamTokenStorage {
    constructor(_db: unknown, _vault: unknown) {}
    get(connectionId: string) {
      return mockTokenGet(connectionId);
    }
  },
}));

// Now import after mocking
const { VM_START } = await import("./start");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Expected domain key for virtualMcpId="vmcp_1", userId="user_1"
const DOMAIN_KEY = createHash("md5")
  .update("vmcp_1:user_1")
  .digest("hex")
  .slice(0, 16);

const BASE_METADATA: VmMetadata = {
  githubRepo: {
    owner: "acme",
    name: "app",
    connectionId: "conn_github_1",
  },
  runtime: {
    selected: "npm",
    port: "3000",
  },
};

const CACHED_ENTRY: VmEntry = {
  vmId: "vm_cached",
  previewUrl: "https://virtual-mcp-id.deco.studio",
  terminalUrl: null,
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
  updateSpy?: ReturnType<typeof mock>;
}): MeshContext {
  const {
    orgId = "org_1",
    userId = "user_1",
    virtualMcp,
    updateSpy = mock(async () => {}),
  } = overrides;

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
        update: updateSpy,
      },
    } as never,
    timings: {
      measure: async <T>(_name: string, cb: () => Promise<T>) => await cb(),
    },
    vault: null as never,
    db: null as never,
    authInstance: null as never,
    boundAuth: null as never,
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

describe("VM_START", () => {
  beforeEach(() => {
    mockVmsCreate.mockReset();
    mockVmStart.mockReset();
    mockVmExec.mockReset();
    mockRoute.mockReset();
    mockTokenGet.mockReset();
    mockVmsCreate.mockImplementation(async () => ({
      vmId: "vm_xyz",
      vm: { terminal: { logs: { route: mockRoute } } },
    }));
    mockVmStart.mockImplementation(async () => {});
    mockVmExec.mockImplementation(async () => {});
    mockRoute.mockImplementation(async () => {});
    mockTokenGet.mockImplementation(async () => ({
      id: "dtok_1",
      connectionId: "conn_github_1",
      accessToken: "ghu_test_token_123",
      refreshToken: null,
      scope: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientId: null,
      clientSecret: null,
      tokenEndpoint: null,
    }));
  });

  it("returns cached entry with isNewVm: false when activeVms[userId] is already set", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { user_1: CACHED_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    expect(result).toEqual({ ...CACHED_ENTRY, isNewVm: false });
    expect(result.isNewVm).toBe(false);
    expect(mockVmsCreate).not.toHaveBeenCalled();
    expect(mockVmExec).not.toHaveBeenCalled();
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("creates a new VM with isNewVm: true and persists entry when no existing activeVms entry", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { other_user: CACHED_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    // Token fetched from downstream_tokens
    expect(mockTokenGet).toHaveBeenCalledWith("conn_github_1");
    expect(mockVmsCreate).toHaveBeenCalledTimes(1);

    expect(result.vmId).toBe("vm_xyz");
    expect(result.previewUrl).toBe(`https://${DOMAIN_KEY}.deco.studio`);
    expect(result.terminalUrl).toBeNull();
    expect(result.isNewVm).toBe(true);

    // storage.update called once: persist new VM entry (patchActiveVms)
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // Update preserves existing entries
    const updateCall = (updateSpy.mock.calls as unknown[][])[0]!;
    const updatedMetadata = (updateCall[2] as { metadata: VmMetadata })
      .metadata;
    expect(updatedMetadata.activeVms?.["other_user"]).toEqual(CACHED_ENTRY);
    expect(updatedMetadata.activeVms?.["user_1"]).toMatchObject({
      vmId: "vm_xyz",
    });
  });

  it("only includes daemon in systemd services", async () => {
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      spec: MockVmSpec;
    };

    const serviceNames = createCall.spec._services.map((s) => s.name as string);
    expect(serviceNames).toEqual([
      "install-ripgrep",
      "prepare-app-dir",
      "daemon",
    ]);
  });

  it("daemon has no after dependency on dev-server", async () => {
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      spec: MockVmSpec;
    };

    const daemon = createCall.spec._services.find((s) => s.name === "daemon")!;
    expect((daemon.after as string[] | undefined) ?? []).not.toContain(
      "dev-server.service",
    );
  });

  it("passes idleTimeoutSeconds: 1800 to freestyle.vms.create", async () => {
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      idleTimeoutSeconds: number;
    };
    expect(createCall.idleTimeoutSeconds).toBe(1800);
  });

  it("daemon script includes /_decopilot_vm/events SSE endpoint and setup source", async () => {
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      spec: MockVmSpec;
    };

    const files = createCall.spec._files as Record<string, { content: string }>;
    const daemonJs = files["/opt/daemon.js"];
    expect(daemonJs).toBeDefined();
    expect(daemonJs!.content).toContain("/_decopilot_vm/events");
    expect(daemonJs!.content).toContain("text/event-stream");
    expect(daemonJs!.content).toContain("/_decopilot_vm/exec/");
    expect(daemonJs!.content).toContain("git clone");
    expect(files["/opt/run-daemon.sh"]).toBeDefined();
  });

  it("clears stale VM entry, creates new VM when vm.start() throws", async () => {
    mockVmStart.mockRejectedValueOnce(new Error("VM not found"));
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { user_1: CACHED_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    expect(mockVmsCreate).toHaveBeenCalledTimes(1);
    expect(result.isNewVm).toBe(true);
    expect(result.vmId).toBe("vm_xyz");

    // updateSpy called twice: clear stale + persist new entry
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });

  it("passes VmSpec integrations for bun runtime — includes node and bun runtime", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      runtime: {
        ...BASE_METADATA.runtime,
        selected: "bun",
      },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      spec: MockVmSpec;
    };

    expect(createCall.spec.builders.node).toBeDefined();
    expect(createCall.spec.builders.js).toBeDefined();
  });

  it("throws 'Virtual MCP not found' when findById returns null", async () => {
    const ctx = makeCtx({ virtualMcp: null });

    await expect(
      VM_START.handler({ virtualMcpId: "vmcp_missing" }, ctx),
    ).rejects.toThrow("Virtual MCP not found");
  });

  it("throws 'Virtual MCP not found' when Virtual MCP belongs to a different org", async () => {
    const virtualMcp = makeVirtualMcp("org_other", BASE_METADATA);
    const ctx = makeCtx({ orgId: "org_1", virtualMcp });

    await expect(
      VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx),
    ).rejects.toThrow("Virtual MCP not found");
  });

  it("throws when no GitHub token is found", async () => {
    mockTokenGet.mockImplementation(async () => null);
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await expect(
      VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx),
    ).rejects.toThrow("No GitHub token found");
  });
});
