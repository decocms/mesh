/**
 * User Sandbox Plugin - Update Tool
 *
 * Updates a user sandbox. If changing required_apps, provide registry_id
 * and the system will automatically fetch connection details from the registry.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxUpdateInputSchema,
  UserSandboxEntitySchema,
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

export const USER_SANDBOX_UPDATE: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_UPDATE",
  description:
    "Update an existing user sandbox. If updating required_apps, provide registry_id to auto-fetch details.",
  inputSchema: UserSandboxUpdateInputSchema,
  outputSchema: UserSandboxEntitySchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof UserSandboxUpdateInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
      createMCPProxy: (connectionId: string) => Promise<MCPProxy>;
    };

    // Require organization context
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }

    // Check access
    await meshCtx.access.check();

    const storage = getPluginStorage();

    // Verify template belongs to organization
    const existing = await storage.templates.findById(typedInput.id);
    if (!existing) {
      throw new Error(`Template not found: ${typedInput.id}`);
    }
    if (existing.organization_id !== meshCtx.organization.id) {
      throw new Error(
        "Access denied: template belongs to another organization",
      );
    }

    // If updating required_apps, lookup from registry
    let requiredApps = undefined;
    if (typedInput.required_apps && typedInput.required_apps.length > 0) {
      if (!typedInput.registry_id) {
        throw new Error("registry_id is required when updating required_apps");
      }
      requiredApps = await lookupAppsFromRegistry(
        meshCtx,
        typedInput.registry_id,
        typedInput.required_apps.map((app) => ({
          app_name: app.app_name,
          selected_tools: app.selected_tools ?? null,
          selected_resources: app.selected_resources ?? null,
          selected_prompts: app.selected_prompts ?? null,
        })),
      );
    }

    const template = await storage.templates.update(typedInput.id, {
      title: typedInput.title,
      description: typedInput.description,
      icon: typedInput.icon,
      required_apps: requiredApps,
      redirect_url: typedInput.redirect_url,
      webhook_url: typedInput.webhook_url,
      event_type: typedInput.event_type,
      agent_title_template: typedInput.agent_title_template,
      agent_instructions: typedInput.agent_instructions,
      tool_selection_mode: typedInput.tool_selection_mode,
      status: typedInput.status,
    });

    return template;
  },
};
