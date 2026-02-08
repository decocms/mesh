/**
 * Project Template Registry Well-Known Binding
 *
 * Defines the interface for accessing project templates from an external registry.
 * Any MCP that implements this binding can provide a list of project templates
 * with their plugin configurations and onboarding requirements.
 *
 * This binding includes:
 * - Collection bindings for LIST and GET operations (read-only)
 * - Templates define which plugins to enable and what connections they need
 */

import { z } from "zod";
import {
  BaseCollectionEntitySchema,
  createCollectionBindings,
} from "./collections";

/**
 * Plugin entry within a project template.
 * Describes which plugins the template enables and their connection requirements.
 */
export const TemplatePluginSchema = z.object({
  pluginId: z.string().describe("Plugin identifier to enable"),
  required: z
    .boolean()
    .optional()
    .describe("Whether this plugin is required for the template to function"),
  defaultConnectionAppId: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Suggested app ID from registry to create the connection for this plugin",
    ),
});

export type TemplatePlugin = z.infer<typeof TemplatePluginSchema>;

/**
 * Project Template schema extending Collection Entity base.
 * A template defines a predefined set of plugins and their configurations
 * that can be used to bootstrap a new project.
 */
export const ProjectTemplateSchema = BaseCollectionEntitySchema.extend({
  category: z
    .string()
    .describe("Template category (e.g., Marketing, Development)"),
  iconColor: z
    .string()
    .nullable()
    .optional()
    .describe("Color for the template icon dot"),
  image: z
    .string()
    .nullable()
    .optional()
    .describe("Preview image URL for the template"),
  plugins: z
    .array(TemplatePluginSchema)
    .describe("Plugins included in this template"),
  ui: z
    .object({
      bannerColor: z.string().nullable().optional(),
      themeColor: z.string().nullable().optional(),
    })
    .nullable()
    .optional()
    .describe("Default UI settings for projects created from this template"),
});

export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema>;

/**
 * Project Template Registry Binding (read-only)
 *
 * Collection bindings for project templates (read-only).
 * Provides LIST and GET operations for available templates.
 *
 * Required tools:
 * - COLLECTION_PROJECT_TEMPLATE_LIST: List available templates with filtering and pagination
 * - COLLECTION_PROJECT_TEMPLATE_GET: Get a single template by ID
 */
export const PROJECT_TEMPLATE_REGISTRY_BINDING = createCollectionBindings(
  "project_template",
  ProjectTemplateSchema,
  { readOnly: true },
);
