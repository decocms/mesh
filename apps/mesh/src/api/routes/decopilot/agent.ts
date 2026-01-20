/**
 * Agent Implementation
 *
 * Mutable agent that holds tools, context, and system prompts.
 * The LLM can modify these during the conversation loop.
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool, ToolSet } from "ai";
import type { Agent, AgentConfig, AgentContext } from "./types";
import { createAgentContext } from "./context";

/**
 * Base Agent implementation with mutable tools and prompts
 */
class BaseAgent implements Agent {
  readonly organizationId: string;
  readonly client: Client | null;
  readonly context: AgentContext;

  private _tools: ToolSet;
  private _systemPrompts: string[];

  constructor(config: {
    organizationId: string;
    client?: Client | null;
    tools?: ToolSet;
    systemPrompts?: string[];
    initialContext?: Record<string, unknown>;
  }) {
    this.organizationId = config.organizationId;
    this.client = config.client ?? null;
    this._tools = { ...config.tools };
    this._systemPrompts = [...(config.systemPrompts ?? [])];
    this.context = createAgentContext(config.initialContext);
  }

  // ==========================================================================
  // Getters - Return current state
  // ==========================================================================

  get tools(): ToolSet {
    return this._tools;
  }

  get systemPrompts(): string[] {
    return this._systemPrompts;
  }

  // ==========================================================================
  // Tool Management
  // ==========================================================================

  addTool(name: string, tool: Tool): void {
    this._tools = { ...this._tools, [name]: tool };
  }

  removeTool(name: string): boolean {
    if (!(name in this._tools)) {
      return false;
    }
    const { [name]: _, ...rest } = this._tools;
    this._tools = rest;
    return true;
  }

  hasTool(name: string): boolean {
    return name in this._tools;
  }

  setTools(tools: ToolSet): void {
    this._tools = { ...tools };
  }

  // ==========================================================================
  // System Prompt Management
  // ==========================================================================

  addSystemPrompt(prompt: string): void {
    this._systemPrompts = [...this._systemPrompts, prompt];
  }

  removeSystemPrompt(index: number): boolean {
    if (index < 0 || index >= this._systemPrompts.length) {
      return false;
    }
    this._systemPrompts = this._systemPrompts.filter((_, i) => i !== index);
    return true;
  }

  setSystemPrompts(prompts: string[]): void {
    this._systemPrompts = [...prompts];
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
    this.context.clear();
  }
}

/**
 * Create an agent from config
 */
export function createAgent(config: AgentConfig & { client?: Client }): Agent {
  return new BaseAgent({
    organizationId: config.organizationId,
    client: config.client,
    tools: config.tools,
    systemPrompts: config.systemPrompts,
    initialContext: config.initialContext,
  });
}
