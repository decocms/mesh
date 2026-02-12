/**
 * User Sandbox Plugin - Update Tool
 *
 * Updates a user sandbox. If changing required_apps, provide registry_id
 * and the system will automatically fetch connection details from the registry.
 */

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxUpdateInputSchema,
  UserSandboxEntitySchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";
import { lookupAppsFromRegistry } from "../utils/registry-lookup";

export const USER_SANDBOX_UPDATE: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_UPDATE",
  description:
    "Update an existing user sandbox. If updating required_apps, provide registry_id to auto-fetch details.",
  inputSchema: UserSandboxUpdateInputSchema,
  outputSchema: UserSandboxEntitySchema,

  handler: orgHandler(UserSandboxUpdateInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();

    const existing = await storage.templates.findById(input.id);
    if (!existing) {
      throw new Error(`Template not found: ${input.id}`);
    }
    if (existing.organization_id !== ctx.organization.id) {
      throw new Error(
        "Access denied: template belongs to another organization",
      );
    }

    let requiredApps = undefined;
    if (input.required_apps && input.required_apps.length > 0) {
      if (!input.registry_id) {
        throw new Error("registry_id is required when updating required_apps");
      }
      requiredApps = await lookupAppsFromRegistry(
        ctx,
        input.registry_id,
        input.required_apps.map((app) => ({
          app_name: app.app_name,
          selected_tools: app.selected_tools ?? null,
          selected_resources: app.selected_resources ?? null,
          selected_prompts: app.selected_prompts ?? null,
        })),
      );
    }

    const template = await storage.templates.update(input.id, {
      title: input.title,
      description: input.description,
      icon: input.icon,
      required_apps: requiredApps,
      redirect_url: input.redirect_url,
      webhook_url: input.webhook_url,
      event_type: input.event_type,
      agent_title_template: input.agent_title_template,
      agent_instructions: input.agent_instructions,
      tool_selection_mode: input.tool_selection_mode,
      status: input.status,
    });

    return template;
  }),
};
