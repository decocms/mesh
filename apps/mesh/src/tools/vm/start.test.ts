import { createHash } from "node:crypto";
import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { MeshContext } from "../../core/mesh-context";
import type { VmEntry, VmMetadata } from "./types";

// ---------------------------------------------------------------------------
// Mock freestyle-sandboxes BEFORE importing VM_START (Bun requires this order)
// ---------------------------------------------------------------------------

const mockReposCreate = mock(
  (_input: unknown): Promise<{ repoId: string }> =>
    Promise.resolve({ repoId: "repo_abc" }),
);

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
  _repo: unknown = undefined;
  _files: unknown = undefined;
  _services: Record<string, unknown>[] = [];

  with(key: string, builder: unknown): MockVmSpec {
    const next = Object.assign(new MockVmSpec(), this);
    next.builders = { ...this.builders, [key]: builder };
    return next;
  }
  repo(url: string, dir: string): MockVmSpec {
    const next = Object.assign(new MockVmSpec(), this);
    next._repo = { url, dir };
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
    git: {
      repos: {
        create: (a: unknown) => mockReposCreate(a),
      },
    },
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
mock.module("@freestyle-sh/with-web-terminal", () => ({
  VmWebTerminal: class VmWebTerminal {
    constructor(_config: unknown) {}
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

describe("VM_START", () => {
  beforeEach(() => {
    mockReposCreate.mockReset();
    mockVmsCreate.mockReset();
    mockVmStart.mockReset();
    mockVmExec.mockReset();
    mockRoute.mockReset();
    mockReposCreate.mockImplementation(async () => ({ repoId: "repo_abc" }));
    mockVmsCreate.mockImplementation(async () => ({
      vmId: "vm_xyz",
      vm: { terminal: { logs: { route: mockRoute } } },
    }));
    mockVmStart.mockImplementation(async () => {});
    mockVmExec.mockImplementation(async () => {});
    mockRoute.mockImplementation(async () => {});
  });

  it("returns cached entry with isNewVm: false when activeVms[userId] is already set (no freestyle call)", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { user_1: CACHED_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    expect(result).toEqual({ ...CACHED_ENTRY, isNewVm: false });
    expect(result.isNewVm).toBe(false);
    expect(mockReposCreate).not.toHaveBeenCalled();
    expect(mockVmsCreate).not.toHaveBeenCalled();
    // ensureLogViewer is gone — exec must not be called
    expect(mockVmExec).not.toHaveBeenCalled();
    // route() must not be called on resume — domain mapping is persistent
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("creates a new VM with isNewVm: true and persists entry when no existing activeVms entry", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { other_user: CACHED_ENTRY }, // existing entry for a different user
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    // Freestyle APIs were called (no repos.create — repo is in VmSpec fluent API)
    expect(mockReposCreate).not.toHaveBeenCalled();
    expect(mockVmsCreate).toHaveBeenCalledTimes(1);

    // Result contains the newly created VM data with isNewVm flag
    expect(result.vmId).toBe("vm_xyz");
    expect(result.previewUrl).toBe(`https://${DOMAIN_KEY}.deco.studio`);
    expect(result.terminalUrl).toBe(`https://${DOMAIN_KEY}-term.deco.studio`);
    expect(result.isNewVm).toBe(true);

    // patchActiveVms called storage.update
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // Verify existing entries are preserved in the update payload
    const updateCall = (updateSpy.mock.calls as unknown[][])[0]!;
    const updatedMetadata = (updateCall[2] as { metadata: VmMetadata })
      .metadata;
    expect(updatedMetadata.activeVms?.["other_user"]).toEqual(CACHED_ENTRY);
    expect(updatedMetadata.activeVms?.["user_1"]).toMatchObject({
      vmId: "vm_xyz",
    });
  });

  it("only includes iframe-proxy in systemd services — web-terminal is managed by VmWebTerminal", async () => {
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      spec: MockVmSpec;
    };

    const serviceNames = createCall.spec._services.map((s) => s.name as string);
    expect(serviceNames).toEqual(["iframe-proxy"]);
    expect(serviceNames).not.toContain("web-terminal");
  });

  it("iframe-proxy has no after dependency on dev-server", async () => {
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      spec: MockVmSpec;
    };

    const iframeProxy = createCall.spec._services.find(
      (s) => s.name === "iframe-proxy",
    )!;
    expect((iframeProxy.after as string[] | undefined) ?? []).not.toContain("dev-server.service");
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

  it("passes VmWebTerminal as spec.terminal and excludes terminal domain from domains array", async () => {
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      spec: MockVmSpec;
      domains: Array<{ domain: string; vmPort: number }>;
    };

    // VmWebTerminal must be in the spec builders
    expect(createCall.spec).toBeDefined();
    expect(createCall.spec.builders.terminal).toBeDefined();

    // Terminal domain is NOT in the domains array — it's routed via route() instead
    const domainNames = createCall.domains.map((d) => d.domain);
    expect(domainNames).not.toContain(`${DOMAIN_KEY}-term.deco.studio`);
  });

  it("calls vm.terminal.logs.route with the terminal domain after creating a new VM", async () => {
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    expect(mockRoute).toHaveBeenCalledTimes(1);
    expect(mockRoute).toHaveBeenCalledWith({
      domain: `${DOMAIN_KEY}-term.deco.studio`,
    });
  });

  it("returns terminalUrl: null when route() fails — VM is not orphaned", async () => {
    mockRoute.mockRejectedValueOnce(new Error("domain service unavailable"));
    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    // VM was created and entry was persisted
    expect(mockVmsCreate).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // Terminal URL is null — terminal unavailable but VM exists
    expect(result.terminalUrl).toBeNull();
    expect(result.vmId).toBe("vm_xyz");
    expect(result.isNewVm).toBe(true);
  });

  it("clears stale VM entry, creates new VM, and calls route() when vm.start() throws", async () => {
    mockVmStart.mockRejectedValueOnce(new Error("VM not found"));
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { user_1: CACHED_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    // Fell through to creating a new VM (no repos.create — repo is in VmSpec fluent API)
    expect(mockReposCreate).not.toHaveBeenCalled();
    expect(mockVmsCreate).toHaveBeenCalledTimes(1);
    expect(result.isNewVm).toBe(true);
    expect(result.vmId).toBe("vm_xyz");

    // route() was called on the newly created VM
    expect(mockRoute).toHaveBeenCalledTimes(1);
    expect(mockRoute).toHaveBeenCalledWith({
      domain: `${DOMAIN_KEY}-term.deco.studio`,
    });

    // updateSpy called twice: once to clear stale, once to persist new entry
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });

  it("passes VmSpec integrations for bun runtime — includes node, bun runtime, and terminal", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      runtime: {
        ...BASE_METADATA.runtime,
        detected: "bun",
        selected: "bun",
      },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    const createCall = (mockVmsCreate.mock.calls as unknown[][])[0]![0] as {
      spec: MockVmSpec;
    };

    // VmNodeJs (proxy), VmBun (runtime), and VmWebTerminal must all be in the spec
    expect(createCall.spec.builders.node).toBeDefined();
    expect(createCall.spec.builders.js).toBeDefined();
    expect(createCall.spec.builders.terminal).toBeDefined();
    // No setup-runtime.sh file — additional files are now in the spec fluent API
    const files = createCall.spec._files as Record<string, { content: string }> | undefined;
    expect(files?.["/opt/setup-runtime.sh"]).toBeUndefined();
  });

  it("throws 'Virtual MCP not found' when findById returns null", async () => {
    const ctx = makeCtx({ virtualMcp: null });

    await expect(
      VM_START.handler({ virtualMcpId: "vmcp_missing" }, ctx),
    ).rejects.toThrow("Virtual MCP not found");
  });

  it("throws 'Virtual MCP not found' when Virtual MCP belongs to a different org", async () => {
    const virtualMcp = makeVirtualMcp("org_other", BASE_METADATA); // different org
    const ctx = makeCtx({ orgId: "org_1", virtualMcp });

    await expect(
      VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx),
    ).rejects.toThrow("Virtual MCP not found");
  });
});
