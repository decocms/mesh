/**
 * Benchmark Runner
 *
 * Orchestrates benchmark execution by:
 * 1. Starting the fake MCP server with generated tools
 * 2. Starting the mesh server
 * 3. Creating connections and gateways
 * 4. Running the chat loop with the LLM
 * 5. Collecting metrics
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkScenario,
} from "./types";
import { startFakeMCP } from "./server/fake-mcp";
import { startMesh } from "./server/mesh";
import { generateTools, getTargetToolForTask } from "./tools/generator";
import { createLLMClient, type LLMClient, type Message } from "./llm/client";
import { createGuide } from "./llm/guide";

/**
 * Run a single benchmark scenario
 */
async function runScenario(
  scenario: BenchmarkScenario,
  llmClient: LLMClient,
  config: BenchmarkConfig,
  scenarioIndex: number,
  totalScenarios: number,
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  let fakeMcp: Awaited<ReturnType<typeof startFakeMCP>> | null = null;
  let mesh: Awaited<ReturnType<typeof startMesh>> | null = null;
  const prefix = `[${scenarioIndex}/${totalScenarios}]`;

  try {
    // Generate tools including the target tool
    const targetTool = getTargetToolForTask(scenario.task.expectedToolCall);
    const toolsWithHandlers = generateTools(scenario.toolCount, targetTool);

    // Start fake MCP server
    fakeMcp = await startFakeMCP(toolsWithHandlers, config.fakeMcpPort);
    if (config.verbose) {
      console.log(`${prefix} [FakeMCP] Started at ${fakeMcp.url}`);
    }

    // Start mesh server
    mesh = await startMesh(config.meshPort);
    if (config.verbose) {
      console.log(`${prefix} [Mesh] Started at ${mesh.baseUrl}`);
    }

    // Create connection and gateway
    const connectionId = await mesh.createConnection(fakeMcp.url);
    const gatewayId = await mesh.createGateway(connectionId, scenario.strategy);
    const gatewayUrl = mesh.getGatewayUrl(gatewayId, scenario.strategy);

    if (config.verbose) {
      console.log(`${prefix} [Gateway] Created at ${gatewayUrl}`);
    }

    // Connect MCP client to gateway using raw MCP SDK
    // (not @decocms/bindings which converts inputSchema to Zod)
    const transport = new StreamableHTTPClientTransport(new URL(gatewayUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${mesh.apiKey}`,
        },
      },
    });

    const mcpClient = new Client(
      { name: "benchmark-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await mcpClient.connect(transport);

    // List tools from gateway - this returns raw JSON Schema
    const { tools } = await mcpClient.listTools();
    const exposedTools: Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema,
    }));

    if (config.verbose) {
      console.log(`${prefix} [Gateway] Exposed ${exposedTools.length} tools`);
    }

    // Run chat loop
    const guide = createGuide();
    const messages: Message[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let success = false;
    let calledTool: string | undefined;
    let retryCount = 0; // Only count retries (wrong answers), not meta-tool executions

    // Meta-tools that execute automatically without counting as retries
    const META_TOOLS = [
      "GATEWAY_SEARCH_TOOLS",
      "GATEWAY_DESCRIBE_TOOLS",
      "GATEWAY_CALL_TOOL",
      "GATEWAY_RUN_CODE",
    ];

    // Initial prompt
    messages.push({
      role: "user",
      content: guide.getInitialPrompt(scenario.task),
    });

    // Max LLM calls to prevent infinite loops (meta-tools can call many times)
    const MAX_LLM_CALLS = 20;
    let llmCallCount = 0;

    while (retryCount < config.maxMessages && llmCallCount < MAX_LLM_CALLS) {
      llmCallCount++;

      if (config.verbose) {
        console.log(
          `${prefix} [Chat] Step ${llmCallCount} (retries: ${retryCount}/${config.maxMessages})`,
        );
      }

      // Call LLM
      const response = await llmClient.chat(
        scenario.model,
        messages,
        exposedTools,
      );

      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      // Add assistant response to messages
      if (response.text) {
        messages.push({
          role: "assistant",
          content: response.text,
        });
      }

      // Check if correct tool was called
      if (response.toolCalls.length > 0) {
        const toolCall = response.toolCalls[0];
        calledTool = toolCall.name;

        if (config.verbose) {
          console.log(`${prefix} [Chat] Tool called: ${calledTool}`);
          if (process.env.BENCHMARK_DEBUG) {
            console.log(
              `${prefix} [Debug] Tool args: ${JSON.stringify(toolCall.args)}`,
            );
          }
        }

        // Check for success - either direct tool or via meta-tools
        if (scenario.strategy === "passthrough") {
          // Direct tool call
          if (calledTool === scenario.task.expectedToolCall.tool) {
            success = true;
            break;
          }
        } else {
          // Meta-tool strategies
          if (calledTool === "GATEWAY_CALL_TOOL") {
            // Check if calling the target tool
            const args = toolCall.args as { name?: string };
            if (args.name === scenario.task.expectedToolCall.tool) {
              success = true;
              break;
            }
          }

          if (calledTool === "GATEWAY_RUN_CODE") {
            // Check if code references the target tool
            const args = toolCall.args as { code?: string };
            if (
              typeof args.code === "string" &&
              args.code.includes(scenario.task.expectedToolCall.tool)
            ) {
              success = true;
              break;
            }
          }

          // Meta-tools that need to execute and continue (no retry count)
          if (
            calledTool === "GATEWAY_SEARCH_TOOLS" ||
            calledTool === "GATEWAY_DESCRIBE_TOOLS"
          ) {
            // Execute the meta-tool
            const result = await mcpClient.callTool({
              name: calledTool,
              arguments: toolCall.args,
            });

            // Add tool result to messages
            messages.push({
              role: "assistant",
              content: `Tool result: ${JSON.stringify(result.content)}`,
            });

            // Continue without counting as retry
            continue;
          }
        }

        // Wrong tool (not expected tool, not a meta-tool) - count as retry
        if (!META_TOOLS.includes(calledTool)) {
          retryCount++;
          messages.push({
            role: "user",
            content: guide.getRetryPrompt(
              scenario.task,
              retryCount,
              response.text,
            ),
          });
        }
      } else {
        // No tool called - count as retry
        retryCount++;
        messages.push({
          role: "user",
          content: guide.getRetryPrompt(
            scenario.task,
            retryCount,
            response.text,
          ),
        });
      }
    }

    return {
      scenario,
      success,
      messageCount: llmCallCount, // Number of LLM calls made
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      durationMs: Date.now() - startTime,
      calledTool,
      exposedToolCount: exposedTools.length,
    };
  } catch (error) {
    const err = error as Error;
    // Log full error for debugging
    if (process.env.BENCHMARK_DEBUG) {
      console.error("  [Debug] Full error:", error);
    }
    return {
      scenario,
      success: false,
      messageCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: Date.now() - startTime,
      error: err.message || String(error),
      exposedToolCount: 0,
    };
  } finally {
    // Cleanup
    if (mesh) {
      await mesh.cleanup();
    }
    if (fakeMcp) {
      fakeMcp.close();
    }
  }
}

/**
 * Run all benchmark scenarios
 */
export async function runBenchmarks(
  scenarios: BenchmarkScenario[],
  config: BenchmarkConfig,
): Promise<BenchmarkResult[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }

  const llmClient = createLLMClient(apiKey);
  const results: BenchmarkResult[] = [];

  console.log(`\nRunning ${scenarios.length} benchmark scenarios...\n`);

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const scenarioIndex = i + 1;
    console.log(`[${scenarioIndex}/${scenarios.length}] ${scenario.name}`);

    const result = await runScenario(
      scenario,
      llmClient,
      config,
      scenarioIndex,
      scenarios.length,
    );
    results.push(result);

    // Log result summary
    const prefix = `[${scenarioIndex}/${scenarios.length}]`;
    const status = result.success ? "✓" : "✗";
    console.log(
      `${prefix} ${status} ${result.totalTokens} tokens, ${result.messageCount} messages, ${result.durationMs}ms`,
    );
    if (result.error) {
      console.log(`${prefix} Error: ${result.error}`);
    }

    // Small delay between scenarios to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}
