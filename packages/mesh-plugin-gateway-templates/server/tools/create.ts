/**
 * Gateway Templates Plugin - Create Tool
 *
 * Creates a gateway template by looking up app details from a registry.
 * You only need to specify app_name and optional tool selection - the rest
 * (connection URL, OAuth config, etc.) is fetched automatically from the registry.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  GatewayTemplateCreateInputSchema,
  GatewayTemplateEntitySchema,
} from "./schema";
import { getPluginStorage } from "./utils";
import { lookupAppsFromRegistry } from "../utils/registry-lookup";

/** MCP proxy client interface */
interface MCPProxyClient {
  callTool: (params: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<{ structuredContent?: unknown } | unknown>;
  listTools: () => Promise<{ tools: Array<{ name: string }> }>;
}

/** MCP proxy interface */
interface MCPProxy {
  client: MCPProxyClient;
}

export const GATEWAY_TEMPLATE_CREATE: ServerPluginToolDefinition = {
  name: "GATEWAY_TEMPLATE_CREATE",
  description:
    "Create a new gateway template for platform integration flows. " +
    "Specify apps by name and the system will automatically fetch connection details from the registry.",
  inputSchema: GatewayTemplateCreateInputSchema,
  outputSchema: GatewayTemplateEntitySchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof GatewayTemplateCreateInputSchema
    >;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      auth: { user: { id: string } | null };
      access: { check: () => Promise<void> };
      createMCPProxy: (connectionId: string) => Promise<MCPProxy>;
    };

    // Require organization context
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }

    // Check access
    await meshCtx.access.check();

    // Lookup app details from registry
    const requiredApps = await lookupAppsFromRegistry(
      meshCtx,
      typedInput.registry_id,
      typedInput.required_apps.map((app) => ({
        app_name: app.app_name,
        selected_tools: app.selected_tools ?? null,
        selected_resources: app.selected_resources ?? null,
        selected_prompts: app.selected_prompts ?? null,
      })),
    );

    const storage = getPluginStorage();

    const template = await storage.templates.create({
      organization_id: meshCtx.organization.id,
      title: typedInput.title,
      description: typedInput.description ?? null,
      icon: typedInput.icon ?? null,
      required_apps: requiredApps,
      redirect_url: typedInput.redirect_url ?? null,
      webhook_url: typedInput.webhook_url ?? null,
      event_type: typedInput.event_type,
      agent_title_template: typedInput.agent_title_template,
      agent_instructions: typedInput.agent_instructions ?? null,
      tool_selection_mode: typedInput.tool_selection_mode,
      created_by: meshCtx.auth.user?.id ?? null,
    });

    return template;
  },
};
