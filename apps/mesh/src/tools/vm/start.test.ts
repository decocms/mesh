import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { VmMap, VmMapEntry } from "@decocms/mesh-sdk";
import type { MeshContext } from "../../core/mesh-context";
import type {
  EnsureOptions,
  Sandbox,
  SandboxId,
  SandboxRunner,
} from "mesh-plugin-user-sandbox/runner";
import { composeSandboxRef } from "mesh-plugin-user-sandbox/runner";

// Pin runner kind — the dev env flips MESH_SANDBOX_RUNNER and VM_START
// reads it at handler time.
process.env.MESH_SANDBOX_RUNNER = "freestyle";

// Mock runner BEFORE importing VM_START — handler is runner-agnostic
// and we don't want to pull the real freestyle SDK.

const mockEnsure = mock(
  async (_id: SandboxId, _opts?: EnsureOptions): Promise<Sandbox> => ({
    handle: "vm_xyz",
    workdir: "/app",
    previewUrl: "https://stub.preview/",
  }),
);

const mockRunner: SandboxRunner = {
  kind: "freestyle",
  ensure: (id, opts) => mockEnsure(id, opts),
  exec: async () => ({ stdout: "", stderr: "", exitCode: 0, timedOut: false }),
  delete: async () => {},
  alive: async () => true,
  getPreviewUrl: async () => "https://stub.preview/",
  proxyDaemonRequest: async () => new Response(null, { status: 204 }),
};

mock.module("../../sandbox/lifecycle", () => ({
  getSharedRunner: () => mockRunner,
  getRunnerByKind: () => mockRunner,
  getSharedRunnerIfInit: () => mockRunner,
  asDockerRunner: () => null,
}));

const { DownstreamTokenStorage: RealDownstreamTokenStorage } = await import(
  "../../storage/downstream-token"
);
import type { DownstreamTokenData } from "../../storage/downstream-token";
import type { DownstreamToken } from "../../storage/types";

const mockTokenGet = mock(
  async (_connectionId: string): Promise<DownstreamToken | null> => ({
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

const mockTokenUpsert = mock(async (_data: DownstreamTokenData) => {});
const mockTokenDelete = mock(async (_connectionId: string) => {});

mock.module("../../storage/downstream-token", () => ({
  DownstreamTokenStorage: class MockDownstreamTokenStorage extends RealDownstreamTokenStorage {
    override async get(connectionId: string) {
      if (connectionId === "conn_github_1") {
        return mockTokenGet(connectionId);
      }
      return super.get(connectionId);
    }
    override async upsert(data: DownstreamTokenData) {
      if (data.connectionId === "conn_github_1") {
        await mockTokenUpsert(data);
        return {
          id: "dtok_1",
          connectionId: data.connectionId,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          scope: data.scope,
          expiresAt: data.expiresAt,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          tokenEndpoint: data.tokenEndpoint,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      return super.upsert(data);
    }
    override async delete(connectionId: string) {
      if (connectionId === "conn_github_1") {
        await mockTokenDelete(connectionId);
        return;
      }
      return super.delete(connectionId);
    }
  },
}));

const mockRefreshAccessToken = mock(
  async (): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    scope?: string;
    error?: string;
  }> => ({ success: true, accessToken: "ghu_refreshed_token" }),
);
mock.module("@/oauth/refresh-access-token", () => ({
  refreshAccessToken: mockRefreshAccessToken,
}));

const { VM_START } = await import("./start");

const BRANCH = "feat/example";
const ORG_ID = "org_1";
const VMCP_ID = "vmcp_1";
const USER_ID = "user_1";

const EXPECTED_REF = composeSandboxRef({
  orgId: ORG_ID,
  virtualMcpId: VMCP_ID,
  branch: BRANCH,
});

type Metadata = {
  githubRepo: { owner: string; name: string; connectionId: string };
  runtime: { selected: string; port: string };
  vmMap?: VmMap;
};

const BASE_METADATA: Metadata = {
  githubRepo: {
    owner: "acme",
    name: "app",
    connectionId: "conn_github_1",
  },
  runtime: { selected: "npm", port: "3000" },
};

const CACHED_ENTRY: VmMapEntry = {
  vmId: "vm_cached",
  previewUrl: "https://cached.preview/",
};

function makeVirtualMcp(orgId: string, metadata: Metadata, id = VMCP_ID) {
  return {
    id,
    organization_id: orgId,
    metadata,
    title: "Test Virtual MCP",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: USER_ID,
  };
}

function makeCtx(overrides: {
  orgId?: string;
  userId?: string;
  virtualMcp?: ReturnType<typeof makeVirtualMcp> | null;
  updateSpy?: ReturnType<typeof mock>;
}): MeshContext {
  const {
    orgId = ORG_ID,
    userId = USER_ID,
    virtualMcp,
    updateSpy = mock(async () => {}),
  } = overrides;

  const findById = mock(async (_id: string) => virtualMcp ?? null);

  return {
    auth: {
      user: {
        id: userId,
        email: "test@example.com",
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
      virtualMcps: { findById, update: updateSpy },
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

describe("VM_START", () => {
  beforeEach(() => {
    mockEnsure.mockReset();
    mockTokenGet.mockReset();
    mockEnsure.mockImplementation(async () => ({
      handle: "vm_xyz",
      workdir: "/app",
      previewUrl: "https://stub.preview/",
    }));
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
    mockRefreshAccessToken.mockReset();
    mockRefreshAccessToken.mockImplementation(async () => ({
      success: true,
      accessToken: "ghu_refreshed_token",
    }));
    mockTokenUpsert.mockReset();
    mockTokenUpsert.mockImplementation(async () => {});
    mockTokenDelete.mockReset();
    mockTokenDelete.mockImplementation(async () => {});
  });

  it("calls runner.ensure with composed projectRef + repo + workload", async () => {
    const virtualMcp = makeVirtualMcp(ORG_ID, BASE_METADATA);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    await VM_START.handler({ virtualMcpId: VMCP_ID, branch: BRANCH }, ctx);

    expect(mockTokenGet).toHaveBeenCalledWith("conn_github_1");
    expect(mockEnsure).toHaveBeenCalledTimes(1);
    const [id, opts] = mockEnsure.mock.calls[0]! as [SandboxId, EnsureOptions];
    expect(id).toEqual({ userId: USER_ID, projectRef: EXPECTED_REF });
    expect(opts.repo?.cloneUrl).toContain("acme/app");
    expect(opts.repo?.branch).toBe(BRANCH);
    expect(opts.repo?.displayName).toBe("acme/app");
    expect(opts.workload).toEqual({
      runtime: "node",
      packageManager: "npm",
      devPort: 3000,
    });
  });

  it("persists vmMap entry with handle + previewUrl + runnerKind", async () => {
    mockEnsure.mockImplementation(async () => ({
      handle: "vm_xyz",
      workdir: "/app",
      previewUrl: "https://stub.preview/",
    }));
    const virtualMcp = makeVirtualMcp(ORG_ID, BASE_METADATA);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_START.handler(
      { virtualMcpId: VMCP_ID, branch: BRANCH },
      ctx,
    );

    expect(result.vmId).toBe("vm_xyz");
    expect(result.previewUrl).toBe("https://stub.preview/");
    expect(result.branch).toBe(BRANCH);
    expect(result.isNewVm).toBe(true);
    expect(result.runnerKind).toBe("freestyle");

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updateCall = (updateSpy.mock.calls as unknown[][])[0]!;
    const updated = (updateCall[2] as { metadata: { vmMap: VmMap } }).metadata;
    const stored = updated.vmMap[USER_ID]?.[BRANCH];
    expect(stored).toMatchObject({
      vmId: "vm_xyz",
      previewUrl: "https://stub.preview/",
      runnerKind: "freestyle",
    });
    // Server-stamped; assert recency, not exact value.
    expect(typeof stored?.createdAt).toBe("number");
    expect(stored?.createdAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it("returns isNewVm=false when runner.ensure returns the same handle as the existing entry", async () => {
    mockEnsure.mockImplementation(async () => ({
      handle: CACHED_ENTRY.vmId,
      workdir: "/app",
      previewUrl: CACHED_ENTRY.previewUrl,
    }));
    const metadata: Metadata = {
      ...BASE_METADATA,
      vmMap: { [USER_ID]: { [BRANCH]: CACHED_ENTRY } },
    };
    const virtualMcp = makeVirtualMcp(ORG_ID, metadata);
    const ctx = makeCtx({ virtualMcp });

    const result = await VM_START.handler(
      { virtualMcpId: VMCP_ID, branch: BRANCH },
      ctx,
    );

    expect(result.vmId).toBe(CACHED_ENTRY.vmId);
    expect(result.isNewVm).toBe(false);
  });

  it("generates deco/* branch when input.branch is omitted and threads it into the ref", async () => {
    const virtualMcp = makeVirtualMcp(ORG_ID, BASE_METADATA);
    const updateSpy = mock(async () => {});
    const ctx = makeCtx({ virtualMcp, updateSpy });

    const result = await VM_START.handler({ virtualMcpId: VMCP_ID }, ctx);

    expect(result.branch.startsWith("deco/")).toBe(true);
    const [id] = mockEnsure.mock.calls[0]! as [SandboxId];
    expect(id.projectRef).toBe(
      composeSandboxRef({
        orgId: ORG_ID,
        virtualMcpId: VMCP_ID,
        branch: result.branch,
      }),
    );
  });

  it("propagates runner.ensure failures", async () => {
    mockEnsure.mockImplementation(async () => {
      throw new Error("runner blew up");
    });
    const virtualMcp = makeVirtualMcp(ORG_ID, BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await expect(
      VM_START.handler({ virtualMcpId: VMCP_ID, branch: BRANCH }, ctx),
    ).rejects.toThrow("runner blew up");
  });

  it("throws 'Virtual MCP not found' when findById returns null", async () => {
    const ctx = makeCtx({ virtualMcp: null });

    await expect(
      VM_START.handler({ virtualMcpId: "vmcp_missing", branch: BRANCH }, ctx),
    ).rejects.toThrow("Virtual MCP not found");
  });

  it("throws 'Virtual MCP not found' when Virtual MCP belongs to a different org", async () => {
    const virtualMcp = makeVirtualMcp("org_other", BASE_METADATA);
    const ctx = makeCtx({ orgId: ORG_ID, virtualMcp });

    await expect(
      VM_START.handler({ virtualMcpId: VMCP_ID, branch: BRANCH }, ctx),
    ).rejects.toThrow("Virtual MCP not found");
  });

  it("throws when no GitHub token is found", async () => {
    // Override mock to exercise the missing-token branch.
    (
      mockTokenGet as unknown as {
        mockImplementation: (fn: () => Promise<null>) => void;
      }
    ).mockImplementation(async () => null);
    const virtualMcp = makeVirtualMcp(ORG_ID, BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await expect(
      VM_START.handler({ virtualMcpId: VMCP_ID, branch: BRANCH }, ctx),
    ).rejects.toThrow("No GitHub token found");
  });

  it("refreshes an expired GitHub token before handing it to the runner", async () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString();
    mockTokenGet.mockImplementation(async () => ({
      id: "dtok_1",
      connectionId: "conn_github_1",
      accessToken: "ghu_stale_token",
      refreshToken: "ghr_refresh_123",
      scope: "repo",
      expiresAt: pastExpiry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientId: "Iv1.test_client",
      clientSecret: "test_secret",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
    }));
    mockRefreshAccessToken.mockImplementation(async () => ({
      success: true,
      accessToken: "ghu_refreshed_token",
      refreshToken: "ghr_refresh_456",
      expiresIn: 3600,
      scope: "repo",
    }));

    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await VM_START.handler({ virtualMcpId: "vmcp_1", branch: BRANCH }, ctx);

    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockTokenUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = (mockTokenUpsert.mock.calls as unknown[][])[0]![0] as {
      accessToken: string;
    };
    expect(upsertArg.accessToken).toBe("ghu_refreshed_token");

    const [, opts] = mockEnsure.mock.calls[0]! as [SandboxId, EnsureOptions];
    expect(opts.repo?.cloneUrl).toContain("ghu_refreshed_token");
    expect(opts.repo?.cloneUrl).not.toContain("ghu_stale_token");
  });

  it("throws RECONNECT_ERROR when refreshing an expired token fails", async () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString();
    mockTokenGet.mockImplementation(async () => ({
      id: "dtok_1",
      connectionId: "conn_github_1",
      accessToken: "ghu_stale_token",
      refreshToken: "ghr_refresh_123",
      scope: "repo",
      expiresAt: pastExpiry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientId: "Iv1.test_client",
      clientSecret: "test_secret",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
    }));
    mockRefreshAccessToken.mockImplementation(async () => ({
      success: false,
      error: "invalid_grant",
    }));

    const virtualMcp = makeVirtualMcp("org_1", BASE_METADATA);
    const ctx = makeCtx({ virtualMcp });

    await expect(
      VM_START.handler({ virtualMcpId: "vmcp_1", branch: BRANCH }, ctx),
    ).rejects.toThrow(
      "GitHub token refresh failed — reconnect the mcp-github integration.",
    );
    expect(mockTokenDelete).toHaveBeenCalledWith("conn_github_1");
    expect(mockEnsure).not.toHaveBeenCalled();
  });
});
