import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { MeshContext } from "../../core/mesh-context";
import type { VmEntry, VmMetadata } from "./types";

// ---------------------------------------------------------------------------
// Mock freestyle-sandboxes BEFORE importing VM_PROBE (Bun requires this order)
// ---------------------------------------------------------------------------

mock.module("freestyle-sandboxes", () => ({
  freestyle: {
    vms: {},
  },
}));

// Now import after mocking
const { VM_PROBE } = await import("./probe");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const { orgId = "org_1", userId = "user-1", virtualMcp } = overrides;

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

describe("VM_PROBE", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  // Restore fetch after each test
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns status and content-type for a reachable previewUrl", async () => {
    const metadata: VmMetadata = {
      activeVms: { "user-1": EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    globalThis.fetch = mock(async (_url: string, _opts: RequestInit) => ({
      status: 200,
      headers: {
        get: (name: string) =>
          name === "content-type" ? "text/html; charset=utf-8" : null,
      },
    })) as never;

    const result = await VM_PROBE.handler(
      { virtualMcpId: "vmcp_1", url: EXISTING_ENTRY.previewUrl },
      ctx,
    );

    expect(result).toEqual({
      status: 200,
      contentType: "text/html; charset=utf-8",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(EXISTING_ENTRY.previewUrl, {
      method: "HEAD",
    });
  });

  it("returns status and content-type for a reachable terminalUrl", async () => {
    const metadata: VmMetadata = {
      activeVms: { "user-1": EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    globalThis.fetch = mock(async () => ({
      status: 200,
      headers: { get: () => "application/octet-stream" },
    })) as never;

    const result = await VM_PROBE.handler(
      { virtualMcpId: "vmcp_1", url: EXISTING_ENTRY.terminalUrl! },
      ctx,
    );

    expect(result).toEqual({
      status: 200,
      contentType: "application/octet-stream",
    });
  });

  it("returns status 0 and null contentType on network error", async () => {
    const metadata: VmMetadata = {
      activeVms: { "user-1": EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    globalThis.fetch = mock(async () => {
      throw new Error("Network failure");
    }) as never;

    const result = await VM_PROBE.handler(
      { virtualMcpId: "vmcp_1", url: EXISTING_ENTRY.previewUrl },
      ctx,
    );

    expect(result).toEqual({ status: 0, contentType: null });
  });

  it("throws when the URL does not match any VM endpoint", async () => {
    const metadata: VmMetadata = {
      activeVms: { "user-1": EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    await expect(
      VM_PROBE.handler(
        {
          virtualMcpId: "vmcp_1",
          url: "https://evil.example.com/steal-secrets",
        },
        ctx,
      ),
    ).rejects.toThrow("URL does not match any VM endpoint");
  });

  it("returns status 0 and null contentType when no VM entry exists for user", async () => {
    // No activeVms for user-1
    const metadata: VmMetadata = {
      activeVms: { "other-user": EXISTING_ENTRY },
    };
    const virtualMcp = makeVirtualMcp("org_1", metadata);
    const ctx = makeCtx({ virtualMcp });

    const fetchSpy = mock(async () => ({
      status: 200,
      headers: { get: () => null },
    }));
    globalThis.fetch = fetchSpy as never;

    const result = await VM_PROBE.handler(
      { virtualMcpId: "vmcp_1", url: EXISTING_ENTRY.previewUrl },
      ctx,
    );

    expect(result).toEqual({ status: 0, contentType: null });
    // fetch should NOT have been called — we return early
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
