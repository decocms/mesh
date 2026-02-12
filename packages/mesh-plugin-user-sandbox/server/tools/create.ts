/**
 * User Sandbox Plugin - Create Tool
 *
 * Creates a user sandbox by looking up app details from a registry.
 */

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxCreateInputSchema,
  UserSandboxEntitySchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";
import { lookupAppsFromRegistry } from "../utils/registry-lookup";

export const USER_SANDBOX_CREATE: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_CREATE",
  description:
    "Create a new user sandbox for platform integration flows. " +
    "Specify apps by name and the system will automatically fetch connection details from the registry.",
  inputSchema: UserSandboxCreateInputSchema,
  outputSchema: UserSandboxEntitySchema,

  handler: orgHandler(UserSandboxCreateInputSchema, async (input, ctx) => {
    const requiredApps = await lookupAppsFromRegistry(
      ctx,
      input.registry_id,
      input.required_apps.map((app) => ({
        app_name: app.app_name,
        selected_tools: app.selected_tools ?? null,
        selected_resources: app.selected_resources ?? null,
        selected_prompts: app.selected_prompts ?? null,
      })),
    );

    const storage = getPluginStorage();

    const template = await storage.templates.create({
      organization_id: ctx.organization.id,
      title: input.title,
      description: input.description ?? null,
      icon: input.icon ?? null,
      required_apps: requiredApps,
      redirect_url: input.redirect_url ?? null,
      webhook_url: input.webhook_url ?? null,
      event_type: input.event_type,
      agent_title_template: input.agent_title_template,
      agent_instructions: input.agent_instructions ?? null,
      tool_selection_mode: input.tool_selection_mode,
      created_by: ctx.auth.user?.id ?? null,
    });

    return template;
  }),
};
