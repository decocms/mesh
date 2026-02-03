# Task 002: MCP Tools for Projects

## Overview

Create MCP tools for managing projects and project plugin configurations. These tools will be used by the UI and can be called via the MCP protocol.

## Prerequisites

- **Task 001** (Database Schema and Storage Layer) must be completed first
  - The `projects` and `project_plugin_configs` tables must exist
  - Storage layer functions must be available

## Context

The MCP Mesh uses tools as the primary API for data operations. Each tool follows a consistent pattern with schemas, handlers, and registry registration.

### Tools to Implement

| Tool | Description |
|------|-------------|
| `PROJECT_LIST` | List projects in organization |
| `PROJECT_GET` | Get project by ID or slug |
| `PROJECT_CREATE` | Create new project |
| `PROJECT_UPDATE` | Update project (name, description, enabled_plugins, ui) |
| `PROJECT_DELETE` | Delete project (block org-admin deletion) |
| `PROJECT_PLUGIN_CONFIG_GET` | Get plugin config for project |
| `PROJECT_PLUGIN_CONFIG_UPDATE` | Update plugin's MCP binding |

## Implementation Steps

### Step 1: Create Tools Directory

Create directory: `apps/mesh/src/tools/projects/`

### Step 2: Create Schema File

Create `apps/mesh/src/tools/projects/schemas.ts`:

```typescript
import { z } from "zod";

// Project UI schema
export const projectUISchema = z.object({
  banner: z.string().nullable().optional(),
  bannerColor: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  themeColor: z.string().nullable().optional(),
});

// PROJECT_LIST
export const projectListInputSchema = z.object({
  organizationId: z.string().describe("Organization ID to list projects for"),
});

export const projectListOutputSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      enabledPlugins: z.array(z.string()).nullable(),
      ui: projectUISchema.nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
  ),
});

// PROJECT_GET
export const projectGetInputSchema = z.object({
  organizationId: z.string().describe("Organization ID"),
  projectId: z.string().optional().describe("Project ID (either this or slug required)"),
  slug: z.string().optional().describe("Project slug (either this or projectId required)"),
}).refine(
  (data) => data.projectId || data.slug,
  { message: "Either projectId or slug must be provided" }
);

export const projectGetOutputSchema = z.object({
  project: z.object({
    id: z.string(),
    organizationId: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    enabledPlugins: z.array(z.string()).nullable(),
    ui: projectUISchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }).nullable(),
});

// PROJECT_CREATE
export const projectCreateInputSchema = z.object({
  organizationId: z.string().describe("Organization ID"),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens").describe("URL-friendly identifier"),
  name: z.string().min(1).max(200).describe("Display name"),
  description: z.string().max(1000).nullable().optional().describe("Project description"),
  enabledPlugins: z.array(z.string()).nullable().optional().describe("Plugin IDs to enable"),
  ui: projectUISchema.nullable().optional().describe("UI customization"),
});

export const projectCreateOutputSchema = z.object({
  project: z.object({
    id: z.string(),
    organizationId: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    enabledPlugins: z.array(z.string()).nullable(),
    ui: projectUISchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

// PROJECT_UPDATE
export const projectUpdateInputSchema = z.object({
  projectId: z.string().describe("Project ID to update"),
  name: z.string().min(1).max(200).optional().describe("New display name"),
  description: z.string().max(1000).nullable().optional().describe("New description"),
  enabledPlugins: z.array(z.string()).nullable().optional().describe("Updated plugin IDs"),
  ui: projectUISchema.nullable().optional().describe("Updated UI customization"),
});

export const projectUpdateOutputSchema = z.object({
  project: z.object({
    id: z.string(),
    organizationId: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    enabledPlugins: z.array(z.string()).nullable(),
    ui: projectUISchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }).nullable(),
});

// PROJECT_DELETE
export const projectDeleteInputSchema = z.object({
  projectId: z.string().describe("Project ID to delete"),
});

export const projectDeleteOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// PROJECT_PLUGIN_CONFIG_GET
export const projectPluginConfigGetInputSchema = z.object({
  projectId: z.string().describe("Project ID"),
  pluginId: z.string().describe("Plugin ID"),
});

export const projectPluginConfigGetOutputSchema = z.object({
  config: z.object({
    id: z.string(),
    projectId: z.string(),
    pluginId: z.string(),
    connectionId: z.string().nullable(),
    settings: z.record(z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }).nullable(),
});

// PROJECT_PLUGIN_CONFIG_UPDATE
export const projectPluginConfigUpdateInputSchema = z.object({
  projectId: z.string().describe("Project ID"),
  pluginId: z.string().describe("Plugin ID"),
  connectionId: z.string().nullable().optional().describe("MCP connection to bind"),
  settings: z.record(z.unknown()).nullable().optional().describe("Plugin-specific settings"),
});

export const projectPluginConfigUpdateOutputSchema = z.object({
  config: z.object({
    id: z.string(),
    projectId: z.string(),
    pluginId: z.string(),
    connectionId: z.string().nullable(),
    settings: z.record(z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});
```

### Step 3: Create Tool Definitions

Create `apps/mesh/src/tools/projects/index.ts`:

```typescript
import type { ToolDefinition } from "../types"; // Adjust import path
import {
  projectListInputSchema,
  projectListOutputSchema,
  projectGetInputSchema,
  projectGetOutputSchema,
  projectCreateInputSchema,
  projectCreateOutputSchema,
  projectUpdateInputSchema,
  projectUpdateOutputSchema,
  projectDeleteInputSchema,
  projectDeleteOutputSchema,
  projectPluginConfigGetInputSchema,
  projectPluginConfigGetOutputSchema,
  projectPluginConfigUpdateInputSchema,
  projectPluginConfigUpdateOutputSchema,
} from "./schemas";

// Constants
const ORG_ADMIN_PROJECT_SLUG = "org-admin";

// Helper to serialize project for output
const serializeProject = (project: any) => ({
  id: project.id,
  organizationId: project.organizationId,
  slug: project.slug,
  name: project.name,
  description: project.description,
  enabledPlugins: project.enabledPlugins,
  ui: project.ui,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
});

const serializeConfig = (config: any) => ({
  id: config.id,
  projectId: config.projectId,
  pluginId: config.pluginId,
  connectionId: config.connectionId,
  settings: config.settings,
  createdAt: config.createdAt.toISOString(),
  updatedAt: config.updatedAt.toISOString(),
});

export const PROJECT_LIST: ToolDefinition = {
  name: "PROJECT_LIST",
  description: "List all projects in an organization",
  inputSchema: projectListInputSchema,
  outputSchema: projectListOutputSchema,
  handler: async (input, context) => {
    const { organizationId } = input;
    const projects = await context.storage.projects.list(organizationId);
    return {
      projects: projects.map(serializeProject),
    };
  },
};

export const PROJECT_GET: ToolDefinition = {
  name: "PROJECT_GET",
  description: "Get a project by ID or slug",
  inputSchema: projectGetInputSchema,
  outputSchema: projectGetOutputSchema,
  handler: async (input, context) => {
    const { organizationId, projectId, slug } = input;
    
    let project;
    if (projectId) {
      project = await context.storage.projects.get(projectId);
    } else if (slug) {
      project = await context.storage.projects.getBySlug(organizationId, slug);
    }
    
    return {
      project: project ? serializeProject(project) : null,
    };
  },
};

export const PROJECT_CREATE: ToolDefinition = {
  name: "PROJECT_CREATE",
  description: "Create a new project in an organization",
  inputSchema: projectCreateInputSchema,
  outputSchema: projectCreateOutputSchema,
  handler: async (input, context) => {
    const { organizationId, slug, name, description, enabledPlugins, ui } = input;
    
    // Check if slug is reserved
    if (slug === ORG_ADMIN_PROJECT_SLUG) {
      throw new Error(`Slug "${ORG_ADMIN_PROJECT_SLUG}" is reserved`);
    }
    
    // Check if slug already exists in this org
    const existing = await context.storage.projects.getBySlug(organizationId, slug);
    if (existing) {
      throw new Error(`Project with slug "${slug}" already exists in this organization`);
    }
    
    const project = await context.storage.projects.create({
      organizationId,
      slug,
      name,
      description: description ?? null,
      enabledPlugins: enabledPlugins ?? null,
      ui: ui ?? null,
    });
    
    return {
      project: serializeProject(project),
    };
  },
};

export const PROJECT_UPDATE: ToolDefinition = {
  name: "PROJECT_UPDATE",
  description: "Update a project's details",
  inputSchema: projectUpdateInputSchema,
  outputSchema: projectUpdateOutputSchema,
  handler: async (input, context) => {
    const { projectId, ...updateData } = input;
    
    const project = await context.storage.projects.update(projectId, updateData);
    
    return {
      project: project ? serializeProject(project) : null,
    };
  },
};

export const PROJECT_DELETE: ToolDefinition = {
  name: "PROJECT_DELETE",
  description: "Delete a project (cannot delete org-admin)",
  inputSchema: projectDeleteInputSchema,
  outputSchema: projectDeleteOutputSchema,
  handler: async (input, context) => {
    const { projectId } = input;
    
    // Get project to check if it's org-admin
    const project = await context.storage.projects.get(projectId);
    if (!project) {
      return { success: false, message: "Project not found" };
    }
    
    if (project.slug === ORG_ADMIN_PROJECT_SLUG) {
      return { success: false, message: "Cannot delete the org-admin project" };
    }
    
    const success = await context.storage.projects.delete(projectId);
    return { success };
  },
};

export const PROJECT_PLUGIN_CONFIG_GET: ToolDefinition = {
  name: "PROJECT_PLUGIN_CONFIG_GET",
  description: "Get plugin configuration for a project",
  inputSchema: projectPluginConfigGetInputSchema,
  outputSchema: projectPluginConfigGetOutputSchema,
  handler: async (input, context) => {
    const { projectId, pluginId } = input;
    const config = await context.storage.projectPluginConfigs.get(projectId, pluginId);
    return {
      config: config ? serializeConfig(config) : null,
    };
  },
};

export const PROJECT_PLUGIN_CONFIG_UPDATE: ToolDefinition = {
  name: "PROJECT_PLUGIN_CONFIG_UPDATE",
  description: "Update or create plugin configuration for a project",
  inputSchema: projectPluginConfigUpdateInputSchema,
  outputSchema: projectPluginConfigUpdateOutputSchema,
  handler: async (input, context) => {
    const { projectId, pluginId, connectionId, settings } = input;
    
    const config = await context.storage.projectPluginConfigs.upsert(projectId, pluginId, {
      connectionId,
      settings,
    });
    
    return {
      config: serializeConfig(config),
    };
  },
};

export const projectTools = [
  PROJECT_LIST,
  PROJECT_GET,
  PROJECT_CREATE,
  PROJECT_UPDATE,
  PROJECT_DELETE,
  PROJECT_PLUGIN_CONFIG_GET,
  PROJECT_PLUGIN_CONFIG_UPDATE,
];
```

### Step 4: Register Tools

Update `apps/mesh/src/tools/registry.ts` (or wherever tools are registered):

```typescript
// Add import
import { projectTools } from "./projects";

// Add to the tools array/registry
export const allTools = [
  // ... existing tools
  ...projectTools,
];
```

### Step 5: Update Context Types

Ensure the tool context includes the new storage methods. Look at how other storage is accessed in existing tools and follow the same pattern.

The context should have:
- `context.storage.projects` - ProjectsStorage instance
- `context.storage.projectPluginConfigs` - ProjectPluginConfigsStorage instance

### Step 6: Add Authorization (if needed)

Check how other tools handle authorization. Project tools likely need:
- User must be member of the organization
- For PROJECT_DELETE, user may need admin role

Follow the existing authorization patterns in the codebase.

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/mesh/src/tools/projects/schemas.ts` | Create |
| `apps/mesh/src/tools/projects/index.ts` | Create |
| `apps/mesh/src/tools/registry.ts` | Modify (register tools) |
| Context/types files | Modify (if needed for storage access) |

## Verification

### 1. Run TypeScript Check

```bash
bun run check
```

All type errors should be resolved.

### 2. Test Tools via MCP Client

If there's a test setup or playground, test each tool:

```typescript
// PROJECT_LIST
await client.call("PROJECT_LIST", { organizationId: "org_123" });

// PROJECT_GET by slug
await client.call("PROJECT_GET", { 
  organizationId: "org_123", 
  slug: "org-admin" 
});

// PROJECT_CREATE
await client.call("PROJECT_CREATE", {
  organizationId: "org_123",
  slug: "my-project",
  name: "My Project",
});

// PROJECT_UPDATE
await client.call("PROJECT_UPDATE", {
  projectId: "proj_123",
  name: "Updated Name",
});

// PROJECT_DELETE (should fail for org-admin)
await client.call("PROJECT_DELETE", {
  projectId: "org_admin_project_id",
});
// Should return { success: false, message: "Cannot delete the org-admin project" }

// PROJECT_PLUGIN_CONFIG_UPDATE
await client.call("PROJECT_PLUGIN_CONFIG_UPDATE", {
  projectId: "proj_123",
  pluginId: "cms",
  connectionId: "conn_456",
});
```

### 3. Run Lint and Format

```bash
bun run fmt
bun run lint
```

No errors should be present.

### 4. Run Tests

```bash
bun test
```

All existing tests should still pass.

### 5. Verify Tool Registration

Start the dev server and verify tools appear in the MCP tools list:

```bash
bun run dev
```

Check that PROJECT_* tools are available.

## Success Criteria

- [ ] All 7 tools implemented with proper schemas
- [ ] Tools registered in the registry
- [ ] PROJECT_CREATE validates reserved slug "org-admin"
- [ ] PROJECT_DELETE blocks deletion of org-admin project
- [ ] PROJECT_GET supports both ID and slug lookup
- [ ] PROJECT_PLUGIN_CONFIG_UPDATE does upsert correctly
- [ ] `bun run check` passes
- [ ] `bun run fmt` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes

## Notes

- Adjust import paths based on actual project structure
- Follow existing tool patterns in the codebase for consistency
- The `ToolDefinition` type and context structure may differ - check existing tools
- Authorization requirements should match existing patterns
