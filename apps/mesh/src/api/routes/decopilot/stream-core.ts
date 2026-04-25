/**
 * Stream Core
 *
 * Extracted core logic from the /stream route handler.
 * This module is HTTP-agnostic and can be invoked by both the
 * SSE endpoint and automation runners.
 */

import type { MeshContext } from "@/core/mesh-context";
import { posthog } from "@/posthog";
import { createVirtualClientFrom } from "@/mcp-clients/virtual-mcp";
import { monitorLlmCall } from "@/monitoring/emit-llm-call";
import { recordLlmCallMetrics } from "@/monitoring/record-llm-call-metrics";
import {
  type GithubRepo,
  isDecopilot,
  sanitizeProviderMetadata,
} from "@decocms/mesh-sdk";
import { SpanStatusCode } from "@opentelemetry/api";
import {
  type ToolSet,
  createUIMessageStream,
  stepCountIs,
  streamText,
} from "ai";
import { getBuiltInTools } from "./built-in-tools";
import { createEnableToolsTool } from "./built-in-tools/enable-tools";
import {
  buildBasePlatformPrompt,
  buildDecopilotAgentPrompt,
  buildRepoEnvironmentPrompt,
  DEFAULT_MAX_TOKENS,
  DEFAULT_THREAD_TITLE,
  DEFAULT_WINDOW_SIZE,
  generateMessageId,
  PARENT_STEP_LIMIT,
} from "./constants";
import { loadAndMergeMessages, processConversation } from "./conversation";
import { uploadFileParts, resolveStorageRefs } from "./file-materializer";
import { isToolVisibleToModel, toolsFromMCP } from "./helpers";
import type { ToolApprovalLevel } from "./helpers";
import { type ChatMode, resolveModeConfig } from "./mode-config";

export type { ChatMode } from "./mode-config";
import { createMemory } from "./memory";
import { ensureModelCompatibility } from "./model-compat";
import {
  checkModelPermission,
  fetchModelPermissions,
} from "./model-permissions";
import type { RunRegistry } from "./run-registry";
import { resolveThreadStatus } from "./status";
import type { StreamBuffer } from "./stream-buffer";
import { genTitle } from "./title-generator";
import type { ChatMessage, ModelInfo, ModelsConfig } from "./types";
import type { CancelBroadcast } from "./cancel-broadcast";
import { ThreadMessage } from "@/storage/types";
import type { MeshProvider } from "@/ai-providers/types";
import {
  createClaudeCodeModel,
  resolveClaudeCodeModelId,
} from "@/ai-providers/adapters/claude-code";
import {
  createCodexModel,
  resolveCodexModelId,
} from "@/ai-providers/adapters/codex";
import { getInternalUrl } from "@/core/server-constants";
import { traced, tracer } from "@/observability";
import { getPodId } from "@/core/pod-identity";

/**
 * Classify a stream error into a small, stable taxonomy for analytics.
 * Consumers (dashboards) can rely on these values being consistent across
 * providers — the raw error message stays in the separate `error_message`
 * prop for debugging.
 */
function classifyStreamError(
  error: unknown,
):
  | "aborted"
  | "insufficient_funds"
  | "rate_limit"
  | "timeout"
  | "auth"
  | "model_error"
  | "tool_error"
  | "unknown" {
  if (error instanceof Error && error.name === "AbortError") return "aborted";
  const msg = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  if (
    /insufficient|no credits|out of credits|balance|payment|quota exceeded|key.?limit|total.?limit|402/i.test(
      msg,
    )
  ) {
    return "insufficient_funds";
  }
  if (/rate.?limit|too many requests|429/i.test(msg)) return "rate_limit";
  if (/timeout|timed out|deadline/i.test(msg)) return "timeout";
  if (/unauthor|forbidden|401|403|invalid.*(key|token)/i.test(msg))
    return "auth";
  if (/tool|mcp|connection/i.test(msg)) return "tool_error";
  if (/model|provider|anthropic|openai|gemini|claude/i.test(msg))
    return "model_error";
  return "unknown";
}

/**
 * Creates a language model from the provider, enabling reasoning when the
 * model advertises the "reasoning" capability (e.g. OpenRouter thinking models).
 */
export function createLanguageModel(provider: MeshProvider, model: ModelInfo) {
  if (model.capabilities?.reasoning !== false) {
    // Provider-specific settings (e.g. OpenRouter reasoning) are not part of
    // the generic ProviderV3 interface, so we cast to pass them through.
    const lm = (provider.aiSdk.languageModel as Function)(model.id, {
      reasoning: { enabled: true, effort: "medium" },
    });
    return lm as ReturnType<typeof provider.aiSdk.languageModel>;
  }
  return provider.aiSdk.languageModel(model.id);
}

// ============================================================================
// Types
// ============================================================================

export interface AgentConfig {
  id: string;
}

export interface StreamCoreInput {
  messages: ChatMessage[];
  models: ModelsConfig;
  agent: AgentConfig;
  temperature: number;
  toolApprovalLevel: ToolApprovalLevel;
  /** Chat mode — plan, forced web search / image, or default */
  mode: ChatMode;
  organizationId: string;
  userId: string;
  taskId?: string;
  triggerId?: string;
  /** Automation that fired this run, used to attribute analytics to the automation rather than the user. */
  automationId?: string;
  automationName?: string;
  windowSize?: number;
  abortSignal?: AbortSignal;
  isResume?: boolean;
  /** Persisted to the thread row on first-message creation. */
  branch?: string | null;
}

export interface StreamCoreDeps {
  runRegistry: RunRegistry;
  streamBuffer?: StreamBuffer;
  cancelBroadcast: CancelBroadcast;
}

export interface StreamCoreResult {
  taskId: string;
  stream: ReadableStream;
}

// ============================================================================
// Core Logic
// ============================================================================

export async function streamCore(
  input: StreamCoreInput,
  ctx: MeshContext,
  deps: StreamCoreDeps,
): Promise<StreamCoreResult> {
  return traced(
    "decopilot.streamCore",
    (rootSpan) => streamCoreInner(input, ctx, deps, rootSpan),
    {
      "decopilot.agent.id": input.agent.id,
      "decopilot.model.id": input.models.thinking.id,
      "decopilot.credential.id": input.models.credentialId,
      "decopilot.organization.id": input.organizationId,
      "decopilot.user.id": input.userId,
      "decopilot.thread.id": input.taskId,
    },
  );
}

async function streamCoreInner(
  input: StreamCoreInput,
  ctx: MeshContext,
  deps: StreamCoreDeps,
  rootSpan: import("@opentelemetry/api").Span,
): Promise<StreamCoreResult> {
  const { runRegistry, streamBuffer } = deps;

  // Normalize: ensure every message has an id (runtime callers may omit it)
  input = {
    ...input,
    messages: input.messages.map((m) =>
      m.id ? m : { ...m, id: generateMessageId() },
    ),
  };

  let closeClients: (() => void) | undefined;
  let runStarted = false;
  let taskId: string | undefined;
  let llmCallStartTime: number | undefined;
  let llmCallLogged = false;

  try {
    const credentialKey = await ctx.storage.aiProviderKeys
      .findById(input.models.credentialId, input.organizationId)
      .catch(() => null);
    const isClaudeCode = credentialKey?.providerId === "claude-code";
    const isCodex = credentialKey?.providerId === "codex";
    const isCliAgent = isClaudeCode || isCodex;
    rootSpan.setAttribute("decopilot.isCliAgent", isCliAgent);
    rootSpan.setAttribute("decopilot.isCodex", isCodex);

    // 1. Check model permissions (skip for Claude Code in local mode)
    if (!isCliAgent) {
      const allowedModels = await fetchModelPermissions(
        ctx.db,
        input.organizationId,
        ctx.auth.user?.role,
      );

      if (
        !checkModelPermission(
          allowedModels,
          input.models.credentialId,
          input.models.thinking.id,
        )
      ) {
        throw new Error("Model not allowed for your role");
      }
    }

    const windowSize = input.windowSize ?? DEFAULT_WINDOW_SIZE;

    // 2. Load entities and create/load memory in parallel
    const [virtualMcp, provider, mem] = await Promise.all([
      ctx.storage.virtualMcps.findById(input.agent.id, input.organizationId),
      isCliAgent
        ? Promise.resolve(null)
        : ctx.aiProviders.activate(
            input.models.credentialId,
            input.organizationId,
          ),
      createMemory(ctx.storage.threads, {
        organization_id: input.organizationId,
        thread_id: input.taskId,
        userId: input.userId,
        defaultWindowSize: windowSize,
        triggerId: input.triggerId,
        automationId: input.automationId,
        automationName: input.automationName,
        virtualMcpId: input.agent.id,
        branch: input.branch ?? null,
      }),
    ]);

    taskId = mem.thread.id;
    ctx.metadata.threadId = mem.thread.id;
    ctx.metadata.triggerId = input.triggerId ?? null;
    ctx.metadata.automationId = input.automationId ?? null;
    ctx.metadata.automationName = input.automationName ?? null;
    rootSpan.setAttribute("decopilot.thread.id", mem.thread.id);

    // Identify the automation as its own PostHog persona so events show
    // "Automation: <name>" instead of being attributed to the user.
    if (input.automationId) {
      posthog.identify({
        distinctId: `automation_${input.automationId}`,
        properties: {
          name: input.automationName ?? `Automation ${input.automationId}`,
          $set: {
            name: input.automationName ?? `Automation ${input.automationId}`,
            is_automation: true,
            automation_id: input.automationId,
            owner_user_id: input.userId,
            organization_id: input.organizationId,
          },
        },
      });
    }

    if (mem.thread.created_by !== input.userId) {
      throw new Error(
        "You are not allowed to write to this thread because you are not the owner",
      );
    }

    const saveMessagesToThread = async (
      ...messages: (ChatMessage | undefined)[]
    ) => {
      const now = Date.now();
      const messagesToSave = [
        ...new Map(messages.filter(Boolean).map((m) => [m!.id, m!])).values(),
      ]
        .filter((m) => m.parts && m.parts.length > 0)
        .map((message, i) => ({
          ...message,
          thread_id: mem.thread.id,
          created_at: new Date(now + i).toISOString(),
          updated_at: new Date(now + i).toISOString(),
        }));
      if (messagesToSave.length === 0) return;
      await mem.save(messagesToSave as ThreadMessage[]).catch((error) => {
        console.error("[decopilot:stream] Error saving messages", error);
      });
    };

    if (!virtualMcp) {
      throw new Error("Agent not found");
    }

    // 3. Dispatch START or RESUME
    if (input.isResume) {
      await runRegistry.execute({
        type: "RESUME",
        taskId: mem.thread.id,
        orgId: input.organizationId,
        userId: input.userId,
        abortController: new AbortController(),
        podId: getPodId(),
      });
    } else {
      await runRegistry.execute({
        type: "START",
        taskId: mem.thread.id,
        orgId: input.organizationId,
        userId: input.userId,
        abortController: new AbortController(),
        podId: getPodId(),
        runConfig: {
          models: input.models,
          agent: input.agent,
          temperature: input.temperature,
          toolApprovalLevel: input.toolApprovalLevel,
          mode: input.mode,
          windowSize: input.windowSize,
          triggerId: input.triggerId,
        },
      });
    }
    runStarted = true;

    const registrySignal = runRegistry.getAbortSignal(mem.thread.id);
    if (!registrySignal) {
      await runRegistry.execute({
        type: "FINISH",
        taskId: mem.thread.id,
        threadStatus: "failed",
      });
      throw new Error("Run was cancelled immediately after starting");
    }

    // If an external abort signal is provided (e.g. from automation runner),
    // forward it to the registry's abort controller so the run is cancelled.
    if (input.abortSignal) {
      const externalSignal = input.abortSignal;
      if (externalSignal.aborted) {
        await runRegistry.execute({
          type: "CANCEL",
          taskId: mem.thread.id,
        });
      } else {
        externalSignal.addEventListener(
          "abort",
          () => {
            runRegistry
              .execute({ type: "CANCEL", taskId: mem.thread.id })
              .catch(() => {});
          },
          { once: true },
        );
      }
    }

    // Purge stale buffered chunks from any previous run on this thread
    streamBuffer?.purge(mem.thread.id);

    // Split system messages from user message
    const systemMessages = input.messages.filter((m) => m.role === "system");
    const requestMessage = input.messages.find((m) => m.role !== "system");

    // Upload file parts before saving so the thread stores stable
    // mesh-storage: URIs instead of base64 data: blobs.
    const materializedRequestMessage = requestMessage
      ? ((await uploadFileParts([requestMessage], ctx)).find(
          (m) => m.role !== "system",
        ) as typeof requestMessage)
      : undefined;

    if (!input.isResume) {
      if (!materializedRequestMessage) {
        throw new Error(
          "No user message found in input — expected at least one non-system message",
        );
      }
      await saveMessagesToThread(materializedRequestMessage);
    }

    // Close MCP clients on abort
    registrySignal.addEventListener("abort", () => {
      closeClients?.();
    });

    const maxOutputTokens =
      input.models.thinking.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

    let streamFinished = false;
    const pendingOps: Promise<void>[] = [];

    // Pre-load conversation (no system messages — those are built separately)
    // When resuming, requestMessage is undefined — conversation loads entirely
    // from DB via createMemory / loadAndMergeMessages.
    const allMessages = await loadAndMergeMessages(
      mem,
      materializedRequestMessage,
      systemMessages,
      windowSize,
    );

    // Find the last coding agent session ID for session resume.
    // Currently only Claude Code supports resume (Codex spawns a new process per request).
    // We filter by codingAgentProvider to avoid using a Codex thread ID as a
    // Claude Code resume session (possible when the user switches providers mid-thread).
    let resumeSessionId: string | undefined;
    if (isClaudeCode) {
      for (let i = allMessages.length - 1; i >= 0; i--) {
        const msg = allMessages[i];
        const meta = msg?.metadata as {
          codingAgentSessionId?: string;
          codingAgentProvider?: string;
        };
        if (
          msg?.role === "assistant" &&
          meta?.codingAgentSessionId &&
          meta?.codingAgentProvider === "claude-code"
        ) {
          resumeSessionId = meta.codingAgentSessionId;
          break;
        }
      }
    }

    const toolOutputMap = new Map<string, string>();
    const organization = ctx.organization!;
    const streamStartAt = Date.now();
    let aggregatedUsage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    } = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let titleHandle: ReturnType<typeof genTitle> | null = null;

    const uiStream = createUIMessageStream({
      originalMessages: allMessages,
      execute: async ({ writer }) => {
        const modeConfig = resolveModeConfig(input.mode, { isCliAgent });

        const passthroughClient = await createVirtualClientFrom(
          virtualMcp,
          ctx,
          "passthrough",
          false,
          { listTimeoutMs: 1_000 },
        );

        // Declared here (before closeClients) to avoid Temporal Dead Zone
        // if the abort signal fires before the codex branch is reached.
        let codexProvider: { close(): Promise<void> } | undefined;

        closeClients = () => {
          passthroughClient.close().catch(() => {});
          codexProvider?.close().catch(() => {});
        };

        const { tools: passthroughTools, nameMap: passthroughNameMap } =
          isCliAgent
            ? { tools: {} as ToolSet, nameMap: new Map<string, string>() }
            : await toolsFromMCP(
                passthroughClient,
                toolOutputMap,
                writer,
                input.toolApprovalLevel,
                { ctx, isPlanMode: modeConfig.isPlanMode },
              );

        // Resolve active VM for (user, branch). Per-entry `runnerKind` drives
        // transport dispatch inside `getBuiltInTools`.
        const vmMetadata = virtualMcp.metadata as {
          vmMap?: Record<
            string,
            Record<
              string,
              {
                vmId: string;
                previewUrl: string;
                runnerKind?: "docker" | "freestyle";
              }
            >
          >;
          githubRepo?: GithubRepo | null;
        };
        const activeVmEntry =
          input.branch && input.userId
            ? vmMetadata?.vmMap?.[input.userId]?.[input.branch]
            : undefined;
        const activeVm = activeVmEntry
          ? {
              runnerKind: (activeVmEntry.runnerKind ?? "freestyle") as
                | "docker"
                | "freestyle",
              vmId: activeVmEntry.vmId,
            }
          : null;

        const builtInTools = isCliAgent
          ? {}
          : await getBuiltInTools(
              writer,
              {
                provider,
                organization,
                models: input.models,
                toolApprovalLevel: input.toolApprovalLevel,
                isPlanMode: modeConfig.isPlanMode,
                toolOutputMap,
                passthroughClient,
                activeVm,
              },
              ctx,
            );

        // Progressive tool disclosure: enable_tools + prepareStep
        const passthroughToolNames = new Set(Object.keys(passthroughTools));
        const builtInToolNames = Object.keys(builtInTools);
        const enabledTools = reconstructEnabledTools(
          allMessages,
          passthroughToolNames,
        );

        // Build tool annotations map for plan-mode gating in enable_tools.
        // Uses the same nameMap from toolsFromMCP so collision-suffixed names
        // match the keys in passthroughTools.
        const toolAnnotations = new Map<string, { readOnlyHint?: boolean }>();
        if (modeConfig.isPlanMode && !isCliAgent) {
          const { tools: toolList } = await passthroughClient.listTools();
          for (const t of toolList) {
            const safeName = passthroughNameMap.get(t.name);
            if (safeName) {
              toolAnnotations.set(safeName, {
                readOnlyHint: t.annotations?.readOnlyHint,
              });
            }
          }
        }

        const tools = isCliAgent
          ? {}
          : {
              ...passthroughTools,
              ...builtInTools,
              enable_tools: createEnableToolsTool(
                enabledTools,
                passthroughToolNames,
                {
                  isPlanMode: modeConfig.isPlanMode,
                  toolAnnotations,
                },
              ),
            };

        // Build composable system prompt array
        const basePrompt = buildBasePlatformPrompt();

        const [toolCatalog, promptCatalog] = await Promise.all([
          buildToolCatalog(passthroughClient, enabledTools, passthroughNameMap),
          buildPromptCatalog(passthroughClient),
        ]);

        // Agent prompt: decopilot-specific or custom agent instructions
        const serverInstructions = passthroughClient.getInstructions();
        const agentPrompt = isDecopilot(input.agent.id)
          ? buildDecopilotAgentPrompt()
          : serverInstructions;

        const planModePrompt = modeConfig.planPrompt;

        const webSearchPrompt =
          modeConfig.webSearchInstructionPrompt && "web_search" in tools
            ? modeConfig.webSearchInstructionPrompt
            : null;

        const repoEnvironmentPrompt = vmMetadata?.githubRepo
          ? buildRepoEnvironmentPrompt(vmMetadata.githubRepo)
          : null;

        const systemPrompts = [
          basePrompt,
          planModePrompt,
          webSearchPrompt,
          repoEnvironmentPrompt,
          toolCatalog,
          promptCatalog,
          agentPrompt,
        ].filter((s): s is string => Boolean(s?.trim()));

        // Resolve mesh-storage: URIs to fresh presigned URLs every turn.
        // Also handles legacy data: URLs from threads predating this pipeline.
        const materializedMessages = await resolveStorageRefs(allMessages, ctx);

        const {
          systemMessages: processedSystemMessages,
          messages: processedMessages,
          originalMessages,
        } = await processConversation(materializedMessages, {
          windowSize,
          models: input.models,
          tools,
        });

        ensureModelCompatibility(input.models, originalMessages);

        const shouldGenerateTitle =
          mem.thread.title === DEFAULT_THREAD_TITLE && !isCliAgent;
        if (shouldGenerateTitle) {
          const titleInput = JSON.stringify(processedMessages[0]?.content);
          titleHandle = genTitle({
            abortSignal: registrySignal,
            model: createLanguageModel(
              provider!,
              input.models.fast ?? input.models.thinking,
            ),
            userMessage: titleInput,
          });
          const titleOp = titleHandle.promise
            .then(async (title) => {
              if (!title) return;

              await ctx.storage.threads
                .update(mem.thread.id, { title })
                .catch((error) => {
                  console.error(
                    "[decopilot:stream] Error updating thread title",
                    error,
                  );
                });

              if (!streamFinished) {
                writer.write({
                  type: "data-thread-title",
                  data: { title },
                  transient: true,
                });
                console.log(
                  "[decopilot:title-debug] SSE title event sent threadId=%s",
                  mem.thread.id,
                );
              } else {
                console.warn(
                  "[decopilot:title-debug] Stream already finished, title SSE NOT sent threadId=%s title=%j",
                  mem.thread.id,
                  title,
                );
              }
            })
            .catch((error) => {
              console.warn(
                "[decopilot:stream] Title generation failed:",
                error,
              );
            });
          pendingOps.push(titleOp);
        }

        let reasoningStartAt: Date | null = null;
        let lastProviderMetadata: Record<string, unknown> | undefined;
        let codingAgentSessionId: string | undefined;
        let codingAgentProvider: string | undefined;
        llmCallStartTime = Date.now();

        // Build language model based on provider type
        let languageModel;

        if (isClaudeCode) {
          // Mint a short-lived API key for Claude Code to auth with the MCP endpoint
          const apiKey = await ctx.boundAuth.apiKey.create({
            name: "claude-code-session",
            expiresIn: 3600,
            metadata: {
              organization: {
                id: organization.id,
                slug: organization.slug,
                name: organization.name,
              },
            },
          });

          const mcpUrl = `${getInternalUrl()}/mcp/virtual-mcp/${input.agent.id}`;
          languageModel = createClaudeCodeModel(
            resolveClaudeCodeModelId(input.models.thinking.id),
            {
              mcpServers: {
                cms: {
                  type: "http",
                  url: mcpUrl,
                  headers: {
                    Authorization: `Bearer ${apiKey.key}`,
                    "x-org-id": input.organizationId,
                  },
                },
              },
              toolApprovalLevel: input.toolApprovalLevel,
              isPlanMode: modeConfig.isPlanMode,
              resume: resumeSessionId,
            },
          );
        } else if (isCodex) {
          const apiKey = await ctx.boundAuth.apiKey.create({
            name: "codex-session",
            expiresIn: 3600,
            metadata: {
              organization: {
                id: organization.id,
                slug: organization.slug,
                name: organization.name,
              },
            },
          });

          const mcpUrl = `${getInternalUrl()}/mcp/virtual-mcp/${input.agent.id}`;
          const codexResult = createCodexModel(
            resolveCodexModelId(input.models.thinking.id),
            {
              mcpServers: {
                cms: {
                  transport: "http",
                  url: mcpUrl,
                  headers: {
                    Authorization: `Bearer ${apiKey.key}`,
                    "x-org-id": input.organizationId,
                  },
                },
              },
              toolApprovalLevel: input.toolApprovalLevel,
              isPlanMode: modeConfig.isPlanMode,
            },
          );
          languageModel = codexResult.model;
          codexProvider = codexResult.provider;
        } else {
          languageModel = createLanguageModel(provider!, input.models.thinking);
        }

        // Span for the LLM streaming call — manually managed because it starts
        // here but ends asynchronously in the onFinish/onError callbacks.
        const llmSpan = tracer.startSpan("decopilot.streamText", {
          attributes: {
            "decopilot.model.id": input.models.thinking.id,
            "decopilot.credential.id": input.models.credentialId,
            "decopilot.isCliAgent": isCliAgent,
            "decopilot.isCodex": isCodex,
          },
        });

        let result;
        try {
          result = streamText({
            model: languageModel,
            system: [
              ...systemPrompts.map((content) => ({
                role: "system" as const,
                content,
              })),
              ...processedSystemMessages,
            ],
            messages: processedMessages,
            tools,
            // Note: Codex thread resume is not supported because each request
            // spawns a new codexAppServer process. Thread IDs are local to a
            // process and cannot be resumed by a different one.
            ...(isCliAgent
              ? {}
              : {
                  prepareStep: (() => {
                    const forcedFirstStepToolName =
                      modeConfig.forcedFirstStepTool &&
                      modeConfig.forcedFirstStepTool in tools
                        ? modeConfig.forcedFirstStepTool
                        : null;
                    let stepIndex = 0;

                    return () => {
                      const isFirstStep = stepIndex === 0;
                      stepIndex++;

                      let activeToolNames = [
                        ...builtInToolNames,
                        "enable_tools",
                        ...enabledTools,
                      ];

                      // Layer 2: In plan mode, filter out any non-read-only tools that
                      // somehow got enabled (safety net for Layer 1 in enable_tools)
                      if (modeConfig.isPlanMode) {
                        activeToolNames = activeToolNames.filter((name) => {
                          // Built-in tools and enable_tools are always allowed
                          if (
                            builtInToolNames.includes(name) ||
                            name === "enable_tools"
                          ) {
                            return true;
                          }
                          // Only allow passthrough tools with readOnlyHint
                          const annotations = toolAnnotations.get(name);
                          return annotations?.readOnlyHint === true;
                        });
                      }

                      const forcedToolName =
                        forcedFirstStepToolName && isFirstStep
                          ? forcedFirstStepToolName
                          : null;

                      return {
                        activeTools: activeToolNames as (keyof typeof tools)[],
                        ...(forcedToolName && {
                          toolChoice: {
                            type: "tool" as const,
                            toolName: forcedToolName as never,
                          },
                        }),
                      };
                    };
                  })(),
                  temperature: input.temperature,
                  maxOutputTokens,
                  stopWhen: stepCountIs(PARENT_STEP_LIMIT),
                }),
            abortSignal: registrySignal,
            onFinish: async ({
              usage,
              totalUsage,
              finishReason,
              request,
              response,
            }) => {
              llmSpan.setAttribute(
                "decopilot.llm.inputTokens",
                totalUsage.inputTokens ?? 0,
              );
              llmSpan.setAttribute(
                "decopilot.llm.outputTokens",
                totalUsage.outputTokens ?? 0,
              );
              llmSpan.setAttribute("decopilot.llm.finishReason", finishReason);
              llmSpan.setStatus({ code: SpanStatusCode.OK });
              llmSpan.end();

              if (registrySignal.aborted) return;
              const durationMs = Date.now() - (llmCallStartTime ?? Date.now());
              llmCallLogged = true;
              recordLlmCallMetrics({
                ctx,
                organizationId: input.organizationId,
                modelId: input.models.thinking.id,
                durationMs,
                isError: false,
                inputTokens: totalUsage.inputTokens,
                outputTokens: totalUsage.outputTokens,
              });
              aggregatedUsage = {
                inputTokens:
                  aggregatedUsage.inputTokens + (totalUsage.inputTokens ?? 0),
                outputTokens:
                  aggregatedUsage.outputTokens + (totalUsage.outputTokens ?? 0),
                totalTokens:
                  aggregatedUsage.totalTokens + (totalUsage.totalTokens ?? 0),
              };
              monitorLlmCall({
                ctx,
                organizationId: input.organizationId,
                agentId: input.agent.id,
                modelId: input.models.thinking.id,
                modelTitle:
                  input.models.thinking.title ?? input.models.thinking.id,
                credentialId: input.models.credentialId,
                taskId: mem.thread.id,
                durationMs,
                isError: false,
                finishReason,
                usage: {
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                  totalTokens: usage.totalTokens ?? 0,
                },
                totalUsage: {
                  inputTokens: totalUsage.inputTokens ?? 0,
                  outputTokens: totalUsage.outputTokens ?? 0,
                  totalTokens: totalUsage.totalTokens ?? 0,
                },
                request,
                response,
                userId: input.userId,
                requestId: ctx.metadata.requestId,
                userAgent: ctx.metadata.userAgent ?? null,
              });
            },
            onError: async (error) => {
              const err =
                error instanceof Error ? error : new Error(String(error));
              llmSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              llmSpan.recordException(err);
              llmSpan.end();

              console.error("[decopilot:stream] Error", error);
              if (registrySignal.aborted) {
                throw error;
              }
              if (!llmCallLogged) {
                const durationMs =
                  Date.now() - (llmCallStartTime ?? Date.now());
                llmCallLogged = true;
                recordLlmCallMetrics({
                  ctx,
                  organizationId: input.organizationId,
                  modelId: input.models.thinking.id,
                  durationMs,
                  isError: true,
                  errorType: error instanceof Error ? error.name : "Error",
                });
                monitorLlmCall({
                  ctx,
                  organizationId: input.organizationId,
                  agentId: input.agent.id,
                  modelId: input.models.thinking.id,
                  modelTitle:
                    input.models.thinking.title ?? input.models.thinking.id,
                  credentialId: input.models.credentialId,
                  taskId: mem.thread.id,
                  durationMs,
                  isError: true,
                  errorMessage:
                    error instanceof Error ? error.message : String(error),
                  userId: input.userId,
                  requestId: ctx.metadata.requestId,
                  userAgent: ctx.metadata.userAgent ?? null,
                });
              }
              throw error;
            },
          });
        } catch (err) {
          llmSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          if (err instanceof Error) llmSpan.recordException(err);
          llmSpan.end();
          throw err;
        }

        const uiMessageStream = result.toUIMessageStream({
          originalMessages,
          generateMessageId,
          onError: (error) => sanitizeStreamError(error),
          messageMetadata: ({ part }) => {
            if (part.type === "start") {
              return {
                agent: {
                  id: input.agent.id ?? null,
                },
                models: {
                  credentialId: input.models.credentialId,
                  thinking: {
                    ...input.models.thinking,
                    title:
                      input.models.thinking.title ?? input.models.thinking.id,
                    provider: input.models.thinking.provider ?? undefined,
                  },
                },
                created_at: new Date(),
                thread_id: mem.thread.id,
              };
            }
            if (part.type === "reasoning-start") {
              if (reasoningStartAt === null) {
                reasoningStartAt = new Date();
              }
              return { reasoning_start_at: reasoningStartAt };
            }
            if (part.type === "reasoning-end") {
              return { reasoning_end_at: new Date() };
            }

            if (part.type === "finish-step") {
              lastProviderMetadata = part.providerMetadata;
              if (isClaudeCode && part.providerMetadata?.["claude-code"]) {
                codingAgentSessionId = (
                  part.providerMetadata["claude-code"] as {
                    sessionId?: string;
                  }
                ).sessionId;
                codingAgentProvider = "claude-code";
              }
              if (isCodex && part.providerMetadata?.["codex-app-server"]) {
                codingAgentSessionId = (
                  part.providerMetadata["codex-app-server"] as {
                    threadId?: string;
                  }
                ).threadId;
                codingAgentProvider = "codex";
              }
              return;
            }

            if (part.type === "finish") {
              const provider = input.models.thinking.provider;
              const totalUsage = part.totalUsage;
              const providerMeta =
                lastProviderMetadata ??
                (part as { providerMetadata?: Record<string, unknown> })
                  .providerMetadata;
              const usage = totalUsage
                ? {
                    inputTokens: totalUsage.inputTokens ?? 0,
                    outputTokens: totalUsage.outputTokens ?? 0,
                    reasoningTokens: totalUsage.reasoningTokens ?? undefined,
                    totalTokens: totalUsage.totalTokens ?? 0,
                    providerMetadata: sanitizeProviderMetadata(
                      provider && providerMeta
                        ? {
                            ...providerMeta,
                            [provider]: {
                              ...((providerMeta[provider] as object) ?? {}),
                              reasoning_details: undefined,
                            },
                          }
                        : providerMeta,
                    ),
                  }
                : undefined;

              return {
                ...(usage && { usage }),
                ...(codingAgentSessionId && { codingAgentSessionId }),
                ...(codingAgentProvider && { codingAgentProvider }),
              };
            }

            return;
          },
        });

        if (streamBuffer) {
          writer.merge(
            streamBuffer.relay(uiMessageStream, mem.thread.id, registrySignal),
          );
        } else {
          writer.merge(uiMessageStream);
        }
      },
      onFinish: async ({ responseMessage, finishReason }) => {
        console.log(
          "[decopilot:title-debug] onFinish called, setting streamFinished=true threadId=%s pendingOps=%d",
          mem.thread.id,
          pendingOps.length,
        );
        streamFinished = true;
        closeClients?.();

        // Stream done — start grace period for title generation
        titleHandle?.finish();

        await Promise.allSettled(pendingOps);
        await saveMessagesToThread(responseMessage);

        if (registrySignal.aborted) return;

        const threadStatus = resolveThreadStatus(
          finishReason,
          responseMessage?.parts as {
            type: string;
            state?: string;
            text?: string;
          }[],
        );

        await runRegistry.execute({
          type: "FINISH",
          taskId: mem.thread.id,
          threadStatus,
        });

        posthog.capture({
          distinctId: input.automationId
            ? `automation_${input.automationId}`
            : input.userId,
          event: "chat_message_completed",
          groups: { organization: input.organizationId },
          properties: {
            organization_id: input.organizationId,
            thread_id: mem.thread.id,
            agent_id: input.agent.id,
            model_id: input.models.thinking.id,
            model_title: input.models.thinking.title,
            mode: input.mode,
            duration_ms: Date.now() - streamStartAt,
            finish_reason: finishReason,
            thread_status: threadStatus,
            input_tokens: aggregatedUsage.inputTokens,
            output_tokens: aggregatedUsage.outputTokens,
            total_tokens: aggregatedUsage.totalTokens,
            is_resume: input.isResume ?? false,
            trigger_id: input.triggerId ?? null,
            is_automation: !!input.automationId,
            automation_id: input.automationId ?? null,
            automation_name: input.automationName ?? null,
            user_id: input.userId,
            user_agent: ctx.metadata.userAgent ?? null,
          },
        });
      },
      onStepFinish: ({ responseMessage }) => {
        const transitions = runRegistry.dispatch({
          type: "STEP_DONE",
          taskId: mem.thread.id,
        });
        pendingOps.push(
          runRegistry.react(transitions).catch((e) => {
            console.error("[decopilot:stream] onStepFinish reactor failed", e);
          }),
        );
        const stepEvent = transitions[0]?.event;
        const shouldSave = input.isResume
          ? stepEvent?.type === "STEP_COMPLETED"
          : stepEvent?.type === "STEP_COMPLETED" &&
            stepEvent.stepCount % 5 === 0;
        if (shouldSave) {
          pendingOps.push(
            saveMessagesToThread(responseMessage).catch((e) => {
              console.error("[decopilot:stream] onStepFinish save failed", e);
            }),
          );
        }
      },
      onError: (error) => {
        streamFinished = true;
        closeClients?.();
        titleHandle?.finish();
        if (registrySignal.aborted) {
          const abortReason = registrySignal.reason as string | undefined;
          const isUserCancelled = abortReason === "cancelled";
          posthog.capture({
            distinctId: input.automationId
              ? `automation_${input.automationId}`
              : input.userId,
            event: isUserCancelled
              ? "chat_message_stopped"
              : "chat_message_aborted",
            groups: { organization: input.organizationId },
            properties: {
              organization_id: input.organizationId,
              thread_id: mem.thread.id,
              agent_id: input.agent.id,
              model_id: input.models.thinking.id,
              mode: input.mode,
              duration_ms: Date.now() - streamStartAt,
              is_resume: input.isResume ?? false,
              trigger_id: input.triggerId ?? null,
              is_automation: !!input.automationId,
              automation_id: input.automationId ?? null,
              automation_name: input.automationName ?? null,
              user_id: input.userId,
              user_agent: ctx.metadata.userAgent ?? null,
              ...(!isUserCancelled && {
                abort_reason: abortReason ?? "unknown",
              }),
            },
          });
          return sanitizeStreamError(error);
        }
        console.error("[decopilot] stream error:", error);

        posthog.capture({
          distinctId: input.automationId
            ? `automation_${input.automationId}`
            : input.userId,
          event: "chat_message_failed",
          groups: { organization: input.organizationId },
          properties: {
            organization_id: input.organizationId,
            thread_id: mem.thread.id,
            agent_id: input.agent.id,
            model_id: input.models.thinking.id,
            mode: input.mode,
            duration_ms: Date.now() - streamStartAt,
            error_category: classifyStreamError(error),
            error_message:
              error instanceof Error ? error.message : String(error),
            is_resume: input.isResume ?? false,
            trigger_id: input.triggerId ?? null,
            is_automation: !!input.automationId,
            automation_id: input.automationId ?? null,
            automation_name: input.automationName ?? null,
            user_id: input.userId,
            user_agent: ctx.metadata.userAgent ?? null,
          },
        });

        runRegistry
          .execute({
            type: "FINISH",
            taskId: mem.thread.id,
            threadStatus: "failed",
          })
          .catch((e) => {
            console.error("[decopilot:stream] onError reactor failed", e);
          });

        return sanitizeStreamError(error);
      },
    });

    return {
      taskId: mem.thread.id,
      stream: uiStream,
    };
  } catch (err) {
    closeClients?.();

    if (runStarted && taskId) {
      runRegistry
        .execute({
          type: "FINISH",
          taskId,
          threadStatus: "failed",
        })
        .catch((e) => {
          console.error("[decopilot:stream] catch-block reactor failed", e);
        });
    }

    throw err;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function stripProviderSpecificDetails(message: string): string {
  const sentences = message.split(/\.\s+/);
  const cleaned = sentences.filter(
    (s) => !/https?:\/\//i.test(s) && !/openrouter/i.test(s),
  );
  if (cleaned.length === 0) return message;
  const result = cleaned.join(". ").trim();
  return result.endsWith(".") ? result : `${result}.`;
}

/**
 * Returns a sanitized, user-facing error message.
 * Provider-specific URLs and branding are stripped so they are never
 * surfaced to the client.
 */
// TODO @pedrofrxncx: remove this code in favor of a better solution
function sanitizeStreamError(error: unknown): string {
  if (error instanceof Error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const msg = error.message.toLowerCase();
    if (
      statusCode === 402 ||
      msg.includes("credit") ||
      msg.includes("insufficient funds") ||
      msg.includes("insufficient balance") ||
      msg.includes("billing") ||
      msg.includes("quota exceeded") ||
      msg.includes("payment required")
    ) {
      // Prefix with [CREDITS] so the frontend can detect credit errors
      // without fragile string matching on provider-specific messages.
      return `[CREDITS] ${stripProviderSpecificDetails(error.message)}`;
    }
    return error.message;
  }
  return String(error);
}

/**
 * Reconstruct the set of enabled tools from conversation history.
 * Scans for prior `enable_tools` calls and re-adds their tool names.
 */
function reconstructEnabledTools(
  messages: ChatMessage[],
  availableToolNames: Set<string>,
): Set<string> {
  const enabled = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (
        "toolName" in part &&
        part.toolName === "enable_tools" &&
        "result" in part &&
        part.result
      ) {
        const result = part.result as { enabled?: string[] };
        if (Array.isArray(result.enabled)) {
          for (const name of result.enabled) {
            if (availableToolNames.has(name)) {
              enabled.add(name);
            }
          }
        }
      }
    }
  }
  return enabled;
}

const REDUNDANT_PREFIXES =
  /^(this tool |use this to |allows you to |a tool that |a tool to |tool to |tool that )/i;

function trimToolDescription(desc: string, maxLen = 80): string {
  let trimmed = desc.replace(REDUNDANT_PREFIXES, "").trim();
  if (trimmed.length > 0) {
    trimmed = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  }
  if (trimmed.length > maxLen) {
    return trimmed.slice(0, maxLen - 1) + "…";
  }
  return trimmed;
}

/**
 * Build a compact tool catalog for the system prompt, grouped by connection.
 * Format: <available-connections><connection name="..." id="...">TOOL|desc</connection></available-connections>
 */
async function buildToolCatalog(
  client: {
    listTools(): Promise<{
      tools: Array<{
        name: string;
        description?: string;
        _meta?: Record<string, unknown>;
      }>;
    }>;
  },
  enabledTools: Set<string>,
  nameMap: Map<string, string>,
): Promise<string | null> {
  const { tools } = await client.listTools();

  const connections = new Map<
    string,
    { name: string; id: string; lines: string[] }
  >();

  for (const t of tools) {
    const safeName = nameMap.get(t.name);
    if (!safeName || enabledTools.has(safeName)) continue;
    if (!isToolVisibleToModel(t)) continue;

    const connId = (t._meta?.connectionId as string) ?? "unknown";
    const connName = connId;
    const desc = trimToolDescription(t.description ?? "");

    let group = connections.get(connId);
    if (!group) {
      group = { name: connName, id: connId, lines: [] };
      connections.set(connId, group);
    }
    group.lines.push(`${safeName}|${desc}`);
  }

  if (connections.size === 0) return null;

  const sections: string[] = [];
  for (const { name, id, lines } of connections.values()) {
    sections.push(
      `<connection name="${escapeXmlAttr(name)}" id="${escapeXmlAttr(id)}">\n${lines.join("\n")}\n</connection>`,
    );
  }

  return `\n\n<available-connections>\n${sections.join("\n")}\n</available-connections>`;
}

function escapeXmlAttr(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Build a compact prompt catalog for the system prompt.
 * Format: <available-prompts>name|description\n...</available-prompts>
 */
async function buildPromptCatalog(client: {
  listPrompts(): Promise<{
    prompts: Array<{
      name: string;
      description?: string;
      arguments?: Array<{ name: string; required?: boolean }>;
    }>;
  }>;
}): Promise<string | null> {
  const { prompts } = await client.listPrompts();
  if (prompts.length === 0) return null;

  const lines = prompts.map((p) => {
    let line = `${p.name}|${p.description ?? ""}`;
    if (p.arguments && p.arguments.length > 0) {
      const args = p.arguments
        .map((a) => (a.required ? `${a.name} (required)` : a.name))
        .join(", ");
      line += `|args: ${args}`;
    }
    return line;
  });

  return `\n\n<available-prompts>\n${lines.join("\n")}\n</available-prompts>`;
}

/**
 * Consume a StreamCoreResult by draining its ReadableStream.
 * Useful for automation runs where there is no SSE consumer.
 */
export async function consumeStreamCore(
  result: StreamCoreResult,
): Promise<void> {
  const reader = result.stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}
