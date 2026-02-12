import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { PLUGIN_ID } from "../../shared";
import { getPluginStorage } from "./utils";
import type {
  PrivateRegistryItemEntity,
  TestResultStatus,
  TestRunConfigSnapshot,
  TestToolResult,
} from "../storage";
import {
  RegistryTestConfigSchema,
  RegistryTestRunStartInputSchema,
  RegistryTestRunStartOutputSchema,
  type RegistryTestConfig,
} from "./test-schemas";

type MCPTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type MCPClientLike = {
  listTools?: () => Promise<{ tools?: MCPTool[] }>;
  callTool: (args: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<{
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
  }>;
  close?: () => Promise<void>;
};

type MeshToolContext = {
  organization: { id: string } | null;
  user?: { id?: string };
  auth?: { user?: { id?: string } };
  access: { check: () => Promise<void> };
  storage: {
    connections: {
      create: (data: Record<string, unknown>) => Promise<{ id: string }>;
      findById: (
        id: string,
        organizationId?: string,
      ) => Promise<{ id: string } | null>;
    };
  };
  createMCPProxy: (connectionId: string) => Promise<MCPClientLike>;
};

const runningControllers = new Map<string, AbortController>();

export function cancelTestRun(runId: string): boolean {
  const controller = runningControllers.get(runId);
  if (!controller) return false;
  controller.abort();
  runningControllers.delete(runId);
  return true;
}

function resolveUserId(ctx: MeshToolContext): string {
  const userId = ctx.user?.id ?? ctx.auth?.user?.id;
  if (!userId) {
    throw new Error("Authenticated user required to create test connections");
  }
  return userId;
}

function detectConnectionType(item: PrivateRegistryItemEntity): "HTTP" | "SSE" {
  const remoteType = item.server.remotes?.[0]?.type?.toLowerCase();
  return remoteType === "sse" ? "SSE" : "HTTP";
}

function getRemoteUrl(item: PrivateRegistryItemEntity): string | null {
  const url = item.server.remotes?.find((r) => r.url)?.url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function isAuthError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error);
  return (
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("oauth") ||
    message.includes("authentication")
  );
}

function stringifyOutput(value: unknown): string | null {
  try {
    return JSON.stringify(value).slice(0, 800);
  } catch {
    return null;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const LOG_PREFIX = "[TEST-AGENT]";

function log(...msgParts: unknown[]): void {
  console.log(LOG_PREFIX, ...msgParts);
}

function logWarn(...msgParts: unknown[]): void {
  console.warn(LOG_PREFIX, ...msgParts);
}

function logError(...msgParts: unknown[]): void {
  console.error(LOG_PREFIX, ...msgParts);
}

async function generateToolInput(args: {
  meshCtx: MeshToolContext;
  testConfig: RegistryTestConfig;
  item: PrivateRegistryItemEntity;
  tool: MCPTool;
}): Promise<Record<string, unknown>> {
  if (
    args.testConfig.testMode !== "full_agent" ||
    !args.testConfig.llmConnectionId ||
    !args.testConfig.llmModelId
  ) {
    log(
      `  [generateToolInput] Skipping LLM generation for tool "${args.tool.name}" (mode=${args.testConfig.testMode}, llmConnection=${!!args.testConfig.llmConnectionId})`,
    );
    return {};
  }

  log(
    `  [generateToolInput] Generating input for tool "${args.tool.name}" via LLM (model=${args.testConfig.llmModelId})`,
  );
  const llmProxy = await args.meshCtx.createMCPProxy(
    args.testConfig.llmConnectionId,
  );
  try {
    const prompt = [
      {
        role: "system",
        content:
          "Return ONLY a compact JSON object with valid sample input arguments for the tool. If unsure, return {}.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                mcp: {
                  id: args.item.id,
                  title: args.item.title,
                  description: args.item.description,
                },
                tool: {
                  name: args.tool.name,
                  description: args.tool.description,
                  inputSchema: args.tool.inputSchema ?? {},
                },
                customPrompt: args.testConfig.agentPrompt ?? "",
              },
              null,
              2,
            ),
          },
        ],
      },
    ];
    const llmResult = await llmProxy.callTool({
      name: "LLM_DO_GENERATE",
      arguments: {
        modelId: args.testConfig.llmModelId,
        callOptions: {
          temperature: 0,
          maxOutputTokens: 600,
          prompt,
        },
      },
    });
    if (llmResult.isError) {
      logWarn(
        `  [generateToolInput] LLM returned error for tool "${args.tool.name}"`,
      );
      return {};
    }
    const text = llmResult.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    if (!text) {
      logWarn(
        `  [generateToolInput] LLM returned empty text for tool "${args.tool.name}"`,
      );
      return {};
    }
    log(
      `  [generateToolInput] LLM response for "${args.tool.name}": ${text.slice(0, 200)}`,
    );
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    logError(
      `  [generateToolInput] Error generating input for tool "${args.tool.name}":`,
      err instanceof Error ? err.message : err,
    );
    return {};
  } finally {
    await llmProxy.close?.().catch(() => {});
  }
}

export async function ensureTestConnection(
  meshCtx: MeshToolContext,
  item: PrivateRegistryItemEntity,
): Promise<string> {
  const storage = getPluginStorage();
  const organizationId = meshCtx.organization?.id;
  if (!organizationId) {
    throw new Error("Organization context required");
  }

  const existing = await storage.testConnections.findByItemId(
    organizationId,
    item.id,
  );
  if (existing) {
    const found = await meshCtx.storage.connections.findById(
      existing.connection_id,
      organizationId,
    );
    if (found) {
      log(
        `  [ensureTestConnection] Reusing existing connection ${existing.connection_id} for item "${item.title}" (${item.id})`,
      );
      return existing.connection_id;
    }
    log(
      `  [ensureTestConnection] Previous connection ${existing.connection_id} not found in core, creating new one`,
    );
  }

  const remoteUrl = getRemoteUrl(item);
  if (!remoteUrl) {
    throw new Error(`Registry item ${item.id} has no remote URL`);
  }

  const userId = resolveUserId(meshCtx);
  const connType = detectConnectionType(item);
  log(
    `  [ensureTestConnection] Creating new ${connType} connection for "${item.title}" → ${remoteUrl}`,
  );

  const created = await meshCtx.storage.connections.create({
    organization_id: organizationId,
    created_by: userId,
    title: `[Test] ${item.title}`,
    description: `Auto-created test connection for ${item.id}`,
    app_name: "private-registry-test",
    app_id: `${PLUGIN_ID}:test`,
    connection_type: connType,
    connection_url: remoteUrl,
    metadata: {
      testConnection: true,
      registryItemId: item.id,
      pluginId: PLUGIN_ID,
    },
  });

  log(
    `  [ensureTestConnection] Created connection ${created.id} for item "${item.title}"`,
  );

  await storage.testConnections.upsert({
    organization_id: organizationId,
    item_id: item.id,
    connection_id: created.id,
    auth_status: "none",
  });

  return created.id;
}

async function applyFailureAction(args: {
  organizationId: string;
  item: PrivateRegistryItemEntity;
  action: RegistryTestConfig["onFailure"];
}): Promise<string> {
  const storage = getPluginStorage();
  switch (args.action) {
    case "unlisted": {
      await storage.items.update(args.organizationId, args.item.id, {
        is_unlisted: true,
      });
      return "unlisted";
    }
    case "remove_public": {
      await storage.items.update(args.organizationId, args.item.id, {
        is_public: false,
      });
      return "removed_public";
    }
    case "remove_private":
    case "remove_all": {
      await storage.items.delete(args.organizationId, args.item.id);
      return args.action === "remove_all" ? "removed_all" : "removed_private";
    }
    default:
      return "none";
  }
}

async function testSingleItem(args: {
  meshCtx: MeshToolContext;
  organizationId: string;
  item: PrivateRegistryItemEntity;
  testConfig: RegistryTestConfig;
  signal: AbortSignal;
}): Promise<{
  status: TestResultStatus;
  connectionOk: boolean;
  toolsListed: boolean;
  toolResults: TestToolResult[];
  errorMessage: string | null;
  actionTaken: string;
  durationMs: number;
}> {
  const startedAt = Date.now();
  if (args.signal.aborted) {
    throw new Error("Run cancelled");
  }

  let status: TestResultStatus = "passed";
  let connectionOk = false;
  let toolsListed = false;
  let errorMessage: string | null = null;
  let actionTaken = "none";
  const toolResults: TestToolResult[] = [];
  let proxy: MCPClientLike | null = null;

  try {
    log(
      `  [testSingleItem] Ensuring test connection for "${args.item.title}"...`,
    );
    const connectionId = await ensureTestConnection(args.meshCtx, args.item);

    log(
      `  [testSingleItem] Creating MCP proxy for connection ${connectionId}...`,
    );
    proxy = await args.meshCtx.createMCPProxy(connectionId);
    connectionOk = true;
    log(`  [testSingleItem] ✓ Proxy created successfully`);

    log(
      `  [testSingleItem] Listing tools (timeout=${args.testConfig.perMcpTimeoutMs}ms)...`,
    );
    const list = await withTimeout(
      proxy.listTools ? proxy.listTools() : Promise.resolve({ tools: [] }),
      args.testConfig.perMcpTimeoutMs,
      `listTools ${args.item.id}`,
    );
    const tools = list.tools ?? [];
    toolsListed = true;
    log(
      `  [testSingleItem] ✓ Found ${tools.length} tools: [${tools.map((t) => t.name).join(", ")}]`,
    );

    if (args.testConfig.testMode !== "health_check") {
      log(
        `  [testSingleItem] Testing ${tools.length} tools (mode=${args.testConfig.testMode})...`,
      );
      for (let i = 0; i < tools.length; i++) {
        const tool = tools[i]!;
        if (!tool || args.signal.aborted) throw new Error("Run cancelled");
        log(
          `  [testSingleItem]   Tool ${i + 1}/${tools.length}: "${tool.name}"`,
        );
        const callStart = Date.now();
        try {
          const toolInput = await generateToolInput({
            meshCtx: args.meshCtx,
            testConfig: args.testConfig,
            item: args.item,
            tool,
          });
          log(
            `  [testSingleItem]   Calling tool "${tool.name}" with input: ${JSON.stringify(toolInput).slice(0, 200)}`,
          );
          const result = await withTimeout(
            proxy.callTool({
              name: tool.name,
              arguments: toolInput,
            }),
            args.testConfig.perToolTimeoutMs,
            `tool ${tool.name}`,
          );
          const success = !result.isError;
          const elapsed = Date.now() - callStart;
          if (success) {
            log(
              `  [testSingleItem]   ✓ Tool "${tool.name}" passed (${elapsed}ms)`,
            );
          } else {
            logWarn(
              `  [testSingleItem]   ✗ Tool "${tool.name}" returned error (${elapsed}ms)`,
            );
          }
          toolResults.push({
            toolName: tool.name,
            success,
            input: toolInput,
            durationMs: elapsed,
            outputPreview: stringifyOutput(
              result.structuredContent ?? result.content,
            ),
            error: success
              ? null
              : (result.content
                  ?.find((part) => part.type === "text")
                  ?.text?.slice(0, 300) ?? "Tool returned error"),
          });
        } catch (error) {
          const elapsed = Date.now() - callStart;
          logError(
            `  [testSingleItem]   ✗ Tool "${tool.name}" threw exception (${elapsed}ms):`,
            error instanceof Error ? error.message : error,
          );
          toolResults.push({
            toolName: tool.name,
            success: false,
            durationMs: elapsed,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const passedTools = toolResults.filter((t) => t.success).length;
      const failedTools = toolResults.filter((t) => !t.success).length;
      log(
        `  [testSingleItem] Tool results: ${passedTools} passed, ${failedTools} failed`,
      );
      if (toolResults.some((t) => !t.success)) {
        status = "failed";
      }
    } else {
      log(
        `  [testSingleItem] Health-check mode: skipping individual tool calls`,
      );
      // Record tool names so the UI can show what was discovered
      for (const tool of tools) {
        toolResults.push({
          toolName: tool.name,
          success: true,
          durationMs: 0,
          error: null,
          outputPreview: "health_check: not called",
        });
      }
    }

    if (status === "failed" && args.testConfig.onFailure !== "none") {
      log(
        `  [testSingleItem] Applying failure action: ${args.testConfig.onFailure}`,
      );
      actionTaken = await applyFailureAction({
        organizationId: args.organizationId,
        item: args.item,
        action: args.testConfig.onFailure,
      });
      log(`  [testSingleItem] Action taken: ${actionTaken}`);
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    if (isAuthError(error)) {
      status = "needs_auth";
      logWarn(
        `  [testSingleItem] Auth error for "${args.item.title}": ${errorMessage}`,
      );
      await getPluginStorage().testConnections.updateAuthStatus(
        args.organizationId,
        args.item.id,
        "needs_auth",
      );
    } else {
      status = "error";
      logError(
        `  [testSingleItem] Error testing "${args.item.title}": ${errorMessage}`,
      );
    }
  } finally {
    await proxy?.close?.().catch(() => {});
  }

  return {
    status,
    connectionOk,
    toolsListed,
    toolResults,
    errorMessage,
    actionTaken,
    durationMs: Date.now() - startedAt,
  };
}

async function runTestLoop(args: {
  meshCtx: MeshToolContext;
  runId: string;
  organizationId: string;
  testConfig: RegistryTestConfig;
  signal: AbortSignal;
}): Promise<void> {
  const runStartedAt = Date.now();
  log("═══════════════════════════════════════════════════");
  log(`Starting test run ${args.runId}`);
  log(
    `  Config: mode=${args.testConfig.testMode}, onFailure=${args.testConfig.onFailure}`,
  );
  log(
    `  Timeouts: perMcp=${args.testConfig.perMcpTimeoutMs}ms, perTool=${args.testConfig.perToolTimeoutMs}ms`,
  );
  log(
    `  Filters: publicOnly=${args.testConfig.testPublicOnly}, privateOnly=${args.testConfig.testPrivateOnly}`,
  );
  log(
    `  LLM: connectionId=${args.testConfig.llmConnectionId ?? "none"}, modelId=${args.testConfig.llmModelId ?? "none"}`,
  );
  log("═══════════════════════════════════════════════════");

  const storage = getPluginStorage();
  const allItems = await storage.items.list(args.organizationId, {
    includeUnlisted: true,
  });
  log(`Fetched ${allItems.items.length} total registry items`);

  const items = allItems.items.filter((item) => {
    if (args.testConfig.testPublicOnly && !item.is_public) return false;
    if (args.testConfig.testPrivateOnly && item.is_public) return false;
    return true;
  });

  log(`After filtering: ${items.length} items to test`);
  for (const item of items) {
    const remoteUrl = getRemoteUrl(item);
    log(
      `  - "${item.title}" (${item.id}) public=${item.is_public} url=${remoteUrl ?? "NO_URL"}`,
    );
  }

  if (items.length === 0) {
    logWarn("No items to test — completing run immediately");
    await storage.testRuns.update(args.organizationId, args.runId, {
      total_items: 0,
      status: "completed",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
    return;
  }

  await storage.testRuns.update(args.organizationId, args.runId, {
    total_items: items.length,
    status: "running",
    started_at: new Date().toISOString(),
  });

  let tested = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]!;
    if (!item || args.signal.aborted) {
      logWarn("Run cancelled by user");
      await storage.testRuns.update(args.organizationId, args.runId, {
        status: "cancelled",
        current_item_id: null,
        finished_at: new Date().toISOString(),
      });
      return;
    }

    log("───────────────────────────────────────────────────");
    log(
      `Testing item ${idx + 1}/${items.length}: "${item.title}" (${item.id})`,
    );
    log("───────────────────────────────────────────────────");

    await storage.testRuns.update(args.organizationId, args.runId, {
      current_item_id: item.id,
    });

    const itemStart = Date.now();
    const result = await testSingleItem({
      meshCtx: args.meshCtx,
      organizationId: args.organizationId,
      item,
      testConfig: args.testConfig,
      signal: args.signal,
    });

    const itemElapsed = Date.now() - itemStart;
    const statusIcon =
      result.status === "passed"
        ? "✓"
        : result.status === "needs_auth"
          ? "🔑"
          : "✗";
    log(
      `${statusIcon} Item "${item.title}" → ${result.status} (${itemElapsed}ms) connection=${result.connectionOk} toolsListed=${result.toolsListed} tools=${result.toolResults.length} action=${result.actionTaken}`,
    );
    if (result.errorMessage) {
      logWarn(`  Error: ${result.errorMessage}`);
    }

    await storage.testResults.create({
      run_id: args.runId,
      organization_id: args.organizationId,
      item_id: item.id,
      item_title: item.title,
      status: result.status,
      error_message: result.errorMessage,
      connection_ok: result.connectionOk,
      tools_listed: result.toolsListed,
      tool_results: result.toolResults,
      duration_ms: result.durationMs,
      action_taken: result.actionTaken,
    });

    tested += 1;
    if (result.status === "passed") passed += 1;
    else if (result.status === "failed" || result.status === "error")
      failed += 1;
    else skipped += 1;

    log(
      `  Progress: ${tested}/${items.length} tested | ${passed} passed | ${failed} failed | ${skipped} skipped`,
    );

    await storage.testRuns.update(args.organizationId, args.runId, {
      tested_items: tested,
      passed_items: passed,
      failed_items: failed,
      skipped_items: skipped,
    });
  }

  const totalElapsed = Date.now() - runStartedAt;
  log("═══════════════════════════════════════════════════");
  log(`Test run ${args.runId} COMPLETED in ${totalElapsed}ms`);
  log(
    `  Results: ${passed} passed, ${failed} failed, ${skipped} skipped out of ${tested} tested`,
  );
  log("═══════════════════════════════════════════════════");

  await storage.testRuns.update(args.organizationId, args.runId, {
    status: "completed",
    current_item_id: null,
    finished_at: new Date().toISOString(),
  });
}

export const REGISTRY_TEST_RUN_START: ServerPluginToolDefinition = {
  name: "REGISTRY_TEST_RUN_START",
  description:
    "Start an MCP registry test run with an isolated set of test connections.",
  inputSchema: RegistryTestRunStartInputSchema,
  outputSchema: RegistryTestRunStartOutputSchema,
  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryTestRunStartInputSchema>;
    const meshCtx = ctx as unknown as MeshToolContext;
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const testConfig = RegistryTestConfigSchema.parse(typedInput.config ?? {});
    log("Handler invoked — creating test run record...");
    log(`  Parsed config:`, JSON.stringify(testConfig, null, 2));

    const storage = getPluginStorage();
    const run = await storage.testRuns.create({
      organization_id: meshCtx.organization.id,
      status: "pending",
      config_snapshot: testConfig as TestRunConfigSnapshot,
      started_at: null,
    });
    log(`Created test run record: ${run.id}`);

    const controller = new AbortController();
    runningControllers.set(run.id, controller);

    // Run in background so UI can poll status.
    void runTestLoop({
      meshCtx,
      runId: run.id,
      organizationId: meshCtx.organization.id,
      testConfig,
      signal: controller.signal,
    })
      .catch(async (error) => {
        await storage.testRuns
          .update(meshCtx.organization!.id, run.id, {
            status: "failed",
            current_item_id: null,
            finished_at: new Date().toISOString(),
          })
          .catch(() => {});
        logError(`Run ${run.id} failed with uncaught error:`, error);
      })
      .finally(() => {
        runningControllers.delete(run.id);
        log(`Run ${run.id} controller cleaned up`);
      });

    return { run };
  },
};
