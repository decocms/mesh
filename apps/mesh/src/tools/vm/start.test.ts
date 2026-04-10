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

const mockVmsCreate = mock(
  (_input: unknown): Promise<{ vmId: string }> =>
    Promise.resolve({ vmId: "vm_xyz" }),
);

mock.module("freestyle-sandboxes", () => ({
  freestyle: {
    git: {
      repos: {
        create: (a: unknown) => mockReposCreate(a),
      },
    },
    vms: {
      create: (a: unknown) => mockVmsCreate(a),
    },
  },
}));

// Now import after mocking
const { VM_START } = await import("./start");

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
    mockReposCreate.mockImplementation(async () => ({ repoId: "repo_abc" }));
    mockVmsCreate.mockImplementation(async () => ({ vmId: "vm_xyz" }));
  });

  it("returns cached entry when activeVms[userId] is already set (no freestyle call)", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { user_1: CACHED_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    expect(result).toEqual(CACHED_ENTRY);
    expect(mockReposCreate).not.toHaveBeenCalled();
    expect(mockVmsCreate).not.toHaveBeenCalled();
  });

  it("creates a new VM and persists entry when no existing activeVms entry", async () => {
    const metadata: VmMetadata = {
      ...BASE_METADATA,
      activeVms: { other_user: CACHED_ENTRY }, // existing entry for a different user
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_START.handler({ virtualMcpId: "vmcp_1" }, ctx);

    // Freestyle APIs were called
    expect(mockReposCreate).toHaveBeenCalledTimes(1);
    expect(mockVmsCreate).toHaveBeenCalledTimes(1);

    // Result contains the newly created VM data
    expect(result.vmId).toBe("vm_xyz");
    expect(result.previewUrl).toBe("https://vmcp-1.deco.studio");
    expect(result.terminalUrl).toBeNull();

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
