import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { MeshContext } from "../../core/mesh-context";
import type { VmEntry, VmMetadata } from "./types";

// ---------------------------------------------------------------------------
// Mock freestyle-sandboxes BEFORE importing VM_DELETE (Bun requires this order)
// ---------------------------------------------------------------------------

const mockVmDelete = mock((): Promise<void> => Promise.resolve());

mock.module("freestyle-sandboxes", () => ({
  freestyle: {
    vms: {
      ref: (_input: unknown) => ({
        delete: () => mockVmDelete(),
      }),
    },
  },
}));

// Now import after mocking
const { VM_DELETE } = await import("./stop");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXISTING_ENTRY: VmEntry = {
  vmId: "vm_existing",
  previewUrl: "https://vmcp-1.deco.studio",
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
    userId = "user-1",
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

describe("VM_DELETE", () => {
  beforeEach(() => {
    mockVmDelete.mockReset();
    mockVmDelete.mockImplementation(async () => {});
  });

  it("deletes Freestyle VM and removes DB entry when activeVms entry exists for user", async () => {
    const metadata: VmMetadata = {
      activeVms: { "user-1": EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_DELETE.handler({ virtualMcpId: "vmcp_1" }, ctx);

    expect(result).toEqual({ success: true });

    // Freestyle vm.delete() was called
    expect(mockVmDelete).toHaveBeenCalledTimes(1);

    // patchActiveVms called storage.update once
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // Verify user-1 key was removed from activeVms
    const updateCall = (updateSpy.mock.calls as unknown[][])[0]!;
    const updatedMetadata = (updateCall[2] as { metadata: VmMetadata })
      .metadata;
    expect(updatedMetadata.activeVms?.["user-1"]).toBeUndefined();
  });

  it("skips Freestyle delete and DB update when no activeVms entry for user", async () => {
    const metadata: VmMetadata = {
      activeVms: { "other-user": EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_DELETE.handler({ virtualMcpId: "vmcp_1" }, ctx);

    expect(result).toEqual({ success: true });
    expect(mockVmDelete).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns success when virtualMcp not found (null from findById)", async () => {
    const ctx = makeCtx({ virtualMcp: null });

    const result = await VM_DELETE.handler(
      { virtualMcpId: "vmcp_missing" },
      ctx,
    );

    expect(result).toEqual({ success: true });
    expect(mockVmDelete).not.toHaveBeenCalled();
  });

  it("throws 'User ID required' when userId is unavailable", async () => {
    const metadata: VmMetadata = {};
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    // Pass empty string to simulate missing userId — getUserId returns undefined/falsy
    const ctx = makeCtx({ virtualMcp, userId: "" });

    // Patch auth.user.id to undefined to simulate missing user ID
    (ctx as unknown as { auth: { user: { id: undefined } } }).auth.user.id =
      undefined;

    await expect(
      VM_DELETE.handler({ virtualMcpId: "vmcp_1" }, ctx),
    ).rejects.toThrow("User ID required");
  });
});
