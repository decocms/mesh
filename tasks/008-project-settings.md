# Task 008: Project Settings Page

## Overview

Create the project settings page where users can edit project details, manage enabled plugins, configure plugin MCP bindings, and delete the project.

## Prerequisites

- **Task 001** (Database Schema and Storage) - Projects and plugin configs must exist
- **Task 002** (MCP Tools) - PROJECT_UPDATE, PROJECT_DELETE, plugin config tools
- **Task 003** (Routing Refactor) - `/settings` route under project
- **Task 004** (Project Layout and Context) - Context must be available

## Context

### Page Sections

1. **General** - Name, description, slug (read-only for org-admin)
2. **Plugins** - Enable/disable plugins for this project
3. **Plugin Bindings** - For each enabled plugin that requires an MCP, show connection selector
4. **Danger Zone** - Delete project (hidden for org-admin)

## Implementation Steps

### Step 1: Create Settings Form Components

Create `apps/mesh/src/web/components/settings/project-general-form.tsx`:

```typescript
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { projectKeys } from "@/web/lib/query-keys";
import { client } from "@/web/lib/client"; // Your MCP client
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { Textarea } from "@/web/components/ui/textarea";
import { Label } from "@/web/components/ui/label";
import { toast } from "sonner"; // Or your toast library

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(1000).nullable(),
});

type FormData = z.infer<typeof formSchema>;

export function ProjectGeneralForm() {
  const { org, project } = useProjectContext();
  const queryClient = useQueryClient();
  const isOrgAdmin = project.slug === ORG_ADMIN_PROJECT_SLUG;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: project.name,
      description: project.description ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      return client.call("PROJECT_UPDATE", {
        projectId: project.id,
        name: data.name,
        description: data.description || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.bySlug(org.id, project.slug) });
      toast.success("Project updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update project: " + error.message);
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Project Name</Label>
        <Input
          id="name"
          {...form.register("name")}
          disabled={isOrgAdmin}
        />
        {isOrgAdmin && (
          <p className="text-xs text-muted-foreground">
            The organization admin project name cannot be changed.
          </p>
        )}
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          value={project.slug}
          disabled
          className="bg-muted"
        />
        <p className="text-xs text-muted-foreground">
          The project slug cannot be changed after creation.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...form.register("description")}
          rows={3}
          placeholder="Optional project description..."
        />
        {form.formState.errors.description && (
          <p className="text-xs text-destructive">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={mutation.isPending || isOrgAdmin && !form.formState.isDirty}
        >
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
```

### Step 2: Create Plugins Form

Create `apps/mesh/src/web/components/settings/project-plugins-form.tsx`:

```typescript
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { projectKeys } from "@/web/lib/query-keys";
import { client } from "@/web/lib/client";
import { Button } from "@/web/components/ui/button";
import { Switch } from "@/web/components/ui/switch";
import { Label } from "@/web/components/ui/label";
import { toast } from "sonner";
import { sourcePlugins } from "@/web/plugins"; // Import available plugins

export function ProjectPluginsForm() {
  const { org, project } = useProjectContext();
  const queryClient = useQueryClient();
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>(
    project.enabledPlugins ?? []
  );

  const mutation = useMutation({
    mutationFn: async (plugins: string[]) => {
      return client.call("PROJECT_UPDATE", {
        projectId: project.id,
        enabledPlugins: plugins,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.bySlug(org.id, project.slug) });
      toast.success("Plugins updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update plugins: " + error.message);
    },
  });

  const togglePlugin = (pluginId: string) => {
    const newPlugins = enabledPlugins.includes(pluginId)
      ? enabledPlugins.filter((id) => id !== pluginId)
      : [...enabledPlugins, pluginId];
    setEnabledPlugins(newPlugins);
  };

  const hasChanges = JSON.stringify(enabledPlugins.sort()) !== 
    JSON.stringify((project.enabledPlugins ?? []).sort());

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enable or disable plugins for this project. Enabled plugins will appear in the sidebar.
      </p>

      <div className="space-y-3">
        {sourcePlugins.map((plugin) => (
          <div
            key={plugin.id}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex items-center gap-3">
              {/* Plugin icon if available */}
              <div className="size-8 rounded-lg bg-muted flex items-center justify-center">
                <span className="text-sm font-medium">
                  {plugin.name?.charAt(0) ?? plugin.id.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <Label htmlFor={`plugin-${plugin.id}`} className="font-medium">
                  {plugin.name ?? plugin.id}
                </Label>
                {plugin.description && (
                  <p className="text-xs text-muted-foreground">
                    {plugin.description}
                  </p>
                )}
              </div>
            </div>
            <Switch
              id={`plugin-${plugin.id}`}
              checked={enabledPlugins.includes(plugin.id)}
              onCheckedChange={() => togglePlugin(plugin.id)}
            />
          </div>
        ))}
      </div>

      {hasChanges && (
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setEnabledPlugins(project.enabledPlugins ?? [])}
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate(enabledPlugins)}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

### Step 3: Create Plugin Bindings Form

Create `apps/mesh/src/web/components/settings/plugin-bindings-form.tsx`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { projectPluginConfigKeys } from "@/web/lib/query-keys";
import { client } from "@/web/lib/client";
import { Button } from "@/web/components/ui/button";
import { Label } from "@/web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/web/components/ui/select";
import { toast } from "sonner";
import { sourcePlugins } from "@/web/plugins";

// Get plugins that require MCP bindings
const pluginsRequiringMcp = sourcePlugins.filter(
  (p) => (p as any).requiresMcpBinding // Add this property to plugins that need it
);

export function PluginBindingsForm() {
  const { org, project } = useProjectContext();
  const queryClient = useQueryClient();

  // Fetch connections
  const { data: connections } = useQuery({
    queryKey: ["connections", org.id],
    queryFn: () => client.call("CONNECTION_LIST", { organizationId: org.id }),
  });

  // Only show plugins that are enabled and require MCP binding
  const relevantPlugins = pluginsRequiringMcp.filter(
    (p) => project.enabledPlugins?.includes(p.id)
  );

  if (relevantPlugins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No enabled plugins require MCP bindings.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure which MCP connections are used by each plugin.
      </p>

      <div className="space-y-4">
        {relevantPlugins.map((plugin) => (
          <PluginBindingRow
            key={plugin.id}
            plugin={plugin}
            connections={connections?.connections ?? []}
          />
        ))}
      </div>
    </div>
  );
}

function PluginBindingRow({
  plugin,
  connections,
}: {
  plugin: { id: string; name?: string };
  connections: Array<{ id: string; name: string }>;
}) {
  const { org, project } = useProjectContext();
  const queryClient = useQueryClient();

  // Fetch current config
  const { data: config } = useQuery({
    queryKey: projectPluginConfigKeys.byPlugin(project.id, plugin.id),
    queryFn: () =>
      client.call("PROJECT_PLUGIN_CONFIG_GET", {
        projectId: project.id,
        pluginId: plugin.id,
      }),
  });

  const mutation = useMutation({
    mutationFn: async (connectionId: string | null) => {
      return client.call("PROJECT_PLUGIN_CONFIG_UPDATE", {
        projectId: project.id,
        pluginId: plugin.id,
        connectionId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectPluginConfigKeys.byPlugin(project.id, plugin.id),
      });
      toast.success("Binding updated");
    },
    onError: (error) => {
      toast.error("Failed to update binding: " + error.message);
    },
  });

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <Label className="font-medium">{plugin.name ?? plugin.id}</Label>
      <Select
        value={config?.config?.connectionId ?? "none"}
        onValueChange={(value) =>
          mutation.mutate(value === "none" ? null : value)
        }
        disabled={mutation.isPending}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select connection" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No connection</SelectItem>
          {connections.map((conn) => (
            <SelectItem key={conn.id} value={conn.id}>
              {conn.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

### Step 4: Create Danger Zone Component

Create `apps/mesh/src/web/components/settings/danger-zone.tsx`:

```typescript
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { client } from "@/web/lib/client";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/web/components/ui/alert-dialog";
import { toast } from "sonner";

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

export function DangerZone() {
  const { org, project } = useProjectContext();
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState("");
  const isOrgAdmin = project.slug === ORG_ADMIN_PROJECT_SLUG;

  const mutation = useMutation({
    mutationFn: async () => {
      return client.call("PROJECT_DELETE", { projectId: project.id });
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Project deleted");
        navigate({
          to: "/$org/$project",
          params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
        });
      } else {
        toast.error(result.message ?? "Failed to delete project");
      }
    },
    onError: (error) => {
      toast.error("Failed to delete project: " + error.message);
    },
  });

  // Don't show danger zone for org-admin
  if (isOrgAdmin) {
    return null;
  }

  const canDelete = confirmName === project.name;

  return (
    <div className="border border-destructive/50 rounded-lg p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-destructive">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Irreversible and destructive actions.
        </p>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Delete Project</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{project.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All project data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <p className="text-sm mb-2">
              Type <strong>{project.name}</strong> to confirm:
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={project.name}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmName("")}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => mutation.mutate()}
              disabled={!canDelete || mutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {mutation.isPending ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

### Step 5: Create Project Settings Page

Update `apps/mesh/src/web/routes/project-settings.tsx`:

```typescript
import { ChevronRight } from "lucide-react";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { ProjectGeneralForm } from "@/web/components/settings/project-general-form";
import { ProjectPluginsForm } from "@/web/components/settings/project-plugins-form";
import { PluginBindingsForm } from "@/web/components/settings/plugin-bindings-form";
import { DangerZone } from "@/web/components/settings/danger-zone";

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

export default function ProjectSettingsPage() {
  const { org, project } = useProjectContext();
  const isOrgAdmin = project.slug === ORG_ADMIN_PROJECT_SLUG;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm mb-6">
        <span className="text-muted-foreground">{org.name}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">{project.name}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
        <span className="font-medium">Settings</span>
      </nav>

      {/* Page Title */}
      <h1 className="text-2xl font-semibold mb-8">
        {isOrgAdmin ? "Organization Admin Settings" : "Project Settings"}
      </h1>

      <div className="space-y-8">
        {/* General Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">General</h2>
            <p className="text-sm text-muted-foreground">
              Basic project information.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <ProjectGeneralForm />
          </div>
        </section>

        {/* Plugins Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Plugins</h2>
            <p className="text-sm text-muted-foreground">
              Manage which plugins are enabled for this project.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <ProjectPluginsForm />
          </div>
        </section>

        {/* Plugin Bindings Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Plugin Bindings</h2>
            <p className="text-sm text-muted-foreground">
              Configure MCP connections for plugins.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <PluginBindingsForm />
          </div>
        </section>

        {/* Danger Zone - Only for non-org-admin */}
        <DangerZone />
      </div>
    </div>
  );
}
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/mesh/src/web/components/settings/project-general-form.tsx` | Create |
| `apps/mesh/src/web/components/settings/project-plugins-form.tsx` | Create |
| `apps/mesh/src/web/components/settings/plugin-bindings-form.tsx` | Create |
| `apps/mesh/src/web/components/settings/danger-zone.tsx` | Create |
| `apps/mesh/src/web/routes/project-settings.tsx` | Update |

## Verification

### 1. Run TypeScript Check

```bash
bun run check
```

All type errors should be resolved.

### 2. Test General Settings

Navigate to `/$org/$project/settings`:

1. Name field should show current project name
2. Editing name and saving should work
3. Description field should work
4. Slug should be read-only

### 3. Test Plugins Settings

1. Toggle plugin switches
2. Save changes
3. Verify sidebar updates to reflect enabled plugins

### 4. Test Plugin Bindings

1. Select a connection for a plugin
2. Verify it saves correctly
3. Change to a different connection

### 5. Test Danger Zone

1. Danger zone should NOT appear for org-admin
2. For regular projects:
   - Click "Delete Project"
   - Type project name to confirm
   - Delete button should enable
   - Deleting should redirect to org-admin

### 6. Run Lint and Format

```bash
bun run fmt
bun run lint
```

No errors should be present.

### 7. Run Tests

```bash
bun test
```

All tests should pass.

## Success Criteria

- [ ] General form updates project name and description
- [ ] Slug field is read-only
- [ ] Org-admin name is read-only
- [ ] Plugin toggles work and save
- [ ] Plugin bindings can be configured
- [ ] Danger zone hidden for org-admin
- [ ] Project deletion requires name confirmation
- [ ] Deletion redirects to org-admin
- [ ] `bun run check` passes
- [ ] `bun run fmt` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes

## Notes

- UI components (Button, Input, etc.) should be imported from your component library
- Form library (react-hook-form) may need to be installed if not present
- Toast notifications should use your existing toast system
- Plugin metadata (name, description) depends on plugin definitions
