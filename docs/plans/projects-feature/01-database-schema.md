# Task 01: Database Schema & Migration

## Objective

Create the database migration for `projects` and `project_plugin_configs` tables, including seeding the `org-admin` project for all existing organizations.

## Context

Projects are becoming a first-class entity below organizations. Every user interaction happens within a project context. The `org-admin` project is a special well-known project auto-created for each organization.

### Key Decisions
- **URL structure:** `/:org-slug/:project-slug`
- **Unique constraint:** `(organizationId, slug)` - same slug can exist in different orgs
- **org-admin project:** Auto-created for every organization

## Deliverables

1. New migration file: `apps/mesh/migrations/0XX-projects.ts`
2. Register migration in `apps/mesh/migrations/index.ts`

## Schema Definitions

### `projects` table

```typescript
interface ProjectsTable {
  id: string;                    // ULID
  organizationId: string;        // FK to organization
  slug: string;                  // unique within org (e.g., "org-admin", "my-cms-project")
  name: string;                  // Display name
  description: string | null;
  enabledPlugins: JsonArray<string[]> | null;  // Plugin IDs enabled for this project
  ui: JsonObject<ProjectUI> | null;            // UI customization (banner, icon, theme)
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectUI {
  banner: string | null;         // URL to banner image
  bannerColor: string | null;    // Hex color for solid color banner (e.g., "#FF6B9D")
  icon: string | null;           // URL to project icon/avatar
  themeColor: string | null;     // Primary theme color for the project
}
```

### `project_plugin_configs` table

For storing per-plugin MCP binding configuration:

```typescript
interface ProjectPluginConfigsTable {
  id: string;
  projectId: string;             // FK to projects
  pluginId: string;              // Which plugin this config is for
  connectionId: string | null;   // FK to connections - the MCP bound to this plugin
  settings: JsonObject | null;   // Additional plugin-specific settings
  createdAt: Date;
  updatedAt: Date;
}

// Unique constraint on (projectId, pluginId)
```

## Implementation Details

### Migration Pattern

Follow existing patterns from `apps/mesh/migrations/`. Key conventions:
- Snake_case column names in database
- Foreign keys with `onDelete("cascade")` for organization-scoped data
- Timestamps use `sql\`CURRENT_TIMESTAMP\`` defaults
- JSON fields stored as `text`
- Create indexes after tables

### Seed org-admin for Existing Organizations

Within the same migration's `up()` function, after creating tables:

```typescript
// For each existing organization, insert org-admin project:
const orgs = await db.selectFrom("organization").select(["id"]).execute();

for (const org of orgs) {
  // Try to get enabled_plugins from organization_settings if exists
  const orgSettings = await db
    .selectFrom("organization_settings")
    .select(["enabled_plugins"])
    .where("organization_id", "=", org.id)
    .executeTakeFirst();

  await db.insertInto("projects").values({
    id: ulid(),
    organization_id: org.id,
    slug: "org-admin",
    name: "Organization Admin",
    enabled_plugins: orgSettings?.enabled_plugins ?? null,
    created_at: sql`CURRENT_TIMESTAMP`,
    updated_at: sql`CURRENT_TIMESTAMP`,
  }).execute();
}
```

### Well-Known Constants

The `ORG_ADMIN_PROJECT_SLUG` constant already exists. Reference location to find:
```bash
rg "ORG_ADMIN_PROJECT_SLUG" --type ts
```

## Example Migration Reference

Look at `apps/mesh/migrations/008-event-bus.ts` for a complex migration example with multiple tables.

## Verification

After implementation:
1. Run `bun run migrate` from `apps/mesh/`
2. Verify tables exist with correct schema
3. Verify org-admin project was created for existing orgs
4. Run `bun run check` to ensure TypeScript compiles
5. Run `bun run fmt` to format code
