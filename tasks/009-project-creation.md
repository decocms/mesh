# Task 009: Project Creation Dialog and Org Creation Hook

## Overview

Create the project creation dialog and add a hook to automatically create the org-admin project when a new organization is created.

## Prerequisites

- **Task 001** (Database Schema and Storage) - Projects storage must exist
- **Task 002** (MCP Tools) - PROJECT_CREATE tool must work
- **Task 003** (Routing Refactor) - New routes must be in place
- **Task 004** (Project Layout and Context) - Context must be available

## Context

### Project Creation Dialog

Accessible from:
- "Create new project" button on projects list page
- "Create new project" card on projects list
- "New Project" option in sidebar project switcher dropdown

### Dialog Fields
- **Name** (required) - Display name
- **Slug** (auto-generated from name, editable) - URL identifier
- **Description** (optional)
- **Banner** - Upload image or pick color (optional)
- **Icon** - Upload project icon (optional)
- **Plugins** (multi-select) - Which plugins to enable

### Org Creation Hook
When a new organization is created, automatically create the org-admin project.

## Implementation Steps

### Step 1: Create Slug Generator Utility

Create `apps/mesh/src/web/lib/slug.ts`:

```typescript
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && slug.length > 0 && slug.length <= 100;
}
```

### Step 2: Create Color Picker Component

Create `apps/mesh/src/web/components/color-picker.tsx`:

```typescript
import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/web/lib/utils";

const PRESET_COLORS = [
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#EF4444", // Red
  "#F97316", // Orange
  "#EAB308", // Yellow
  "#22C55E", // Green
  "#14B8A6", // Teal
  "#06B6D4", // Cyan
  "#6366F1", // Indigo
  "#64748B", // Slate
  "#000000", // Black
];

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={cn(
              "size-8 rounded-lg transition-all",
              value === color && "ring-2 ring-offset-2 ring-primary"
            )}
            style={{ backgroundColor: color }}
          >
            {value === color && (
              <Check className="size-4 text-white mx-auto" />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? "#3B82F6"}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 rounded cursor-pointer"
        />
        <span className="text-sm text-muted-foreground">Custom color</span>
      </div>
    </div>
  );
}
```

### Step 3: Create Project Creation Dialog

Create `apps/mesh/src/web/components/create-project-dialog.tsx`:

```typescript
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { projectKeys } from "@/web/lib/query-keys";
import { client } from "@/web/lib/client";
import { generateSlug, isValidSlug } from "@/web/lib/slug";
import { ColorPicker } from "./color-picker";
import { sourcePlugins } from "@/web/plugins";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/web/components/ui/dialog";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import { Textarea } from "@/web/components/ui/textarea";
import { Label } from "@/web/components/ui/label";
import { Switch } from "@/web/components/ui/switch";
import { toast } from "sonner";

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  slug: z.string().min(1, "Slug is required").max(100).refine(isValidSlug, {
    message: "Slug must be lowercase alphanumeric with hyphens only",
  }),
  description: z.string().max(1000).optional(),
  bannerColor: z.string().nullable().optional(),
  enabledPlugins: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      bannerColor: "#3B82F6",
      enabledPlugins: [],
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      return client.call("PROJECT_CREATE", {
        organizationId: org.id,
        slug: data.slug,
        name: data.name,
        description: data.description || null,
        enabledPlugins: data.enabledPlugins ?? [],
        ui: {
          banner: null,
          bannerColor: data.bannerColor ?? null,
          icon: null,
          themeColor: data.bannerColor ?? null,
        },
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list(org.id) });
      toast.success("Project created successfully");
      onOpenChange(false);
      form.reset();
      setSlugManuallyEdited(false);
      // Navigate to the new project
      navigate({
        to: "/$org/$project",
        params: { org: org.slug, project: result.project.slug },
      });
    },
    onError: (error) => {
      toast.error("Failed to create project: " + error.message);
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    form.setValue("name", name);
    
    if (!slugManuallyEdited) {
      const slug = generateSlug(name);
      form.setValue("slug", slug);
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManuallyEdited(true);
    form.setValue("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const togglePlugin = (pluginId: string) => {
    const current = form.getValues("enabledPlugins") ?? [];
    const newPlugins = current.includes(pluginId)
      ? current.filter((id) => id !== pluginId)
      : [...current, pluginId];
    form.setValue("enabledPlugins", newPlugins);
  };

  const selectedPlugins = form.watch("enabledPlugins") ?? [];
  const bannerColor = form.watch("bannerColor");
  const slug = form.watch("slug");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up a new project in {org.name}. You can configure plugins and settings after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Banner Preview */}
          <div
            className="h-20 rounded-lg relative"
            style={{ backgroundColor: bannerColor ?? "#3B82F6" }}
          >
            <div className="absolute -bottom-4 left-4">
              <div
                className="size-12 rounded-lg border-2 border-background flex items-center justify-center text-lg font-semibold text-white"
                style={{ backgroundColor: bannerColor ?? "#3B82F6" }}
              >
                {form.watch("name")?.charAt(0)?.toUpperCase() || "P"}
              </div>
            </div>
          </div>

          {/* Banner Color */}
          <div className="space-y-2 pt-4">
            <Label>Banner Color</Label>
            <ColorPicker
              value={bannerColor ?? null}
              onChange={(color) => form.setValue("bannerColor", color)}
            />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input
              id="name"
              value={form.watch("name")}
              onChange={handleNameChange}
              placeholder="My Awesome Project"
              autoFocus
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">Slug *</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                /{org.slug}/
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={handleSlugChange}
                placeholder="my-awesome-project"
                className="flex-1"
              />
            </div>
            {form.formState.errors.slug && (
              <p className="text-xs text-destructive">
                {form.formState.errors.slug.message}
              </p>
            )}
            {slug === ORG_ADMIN_PROJECT_SLUG && (
              <p className="text-xs text-destructive">
                "{ORG_ADMIN_PROJECT_SLUG}" is a reserved slug
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...form.register("description")}
              placeholder="What is this project for?"
              rows={2}
            />
          </div>

          {/* Plugins */}
          <div className="space-y-2">
            <Label>Enable Plugins</Label>
            <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
              {sourcePlugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="flex items-center justify-between p-2"
                >
                  <span className="text-sm">{plugin.name ?? plugin.id}</span>
                  <Switch
                    checked={selectedPlugins.includes(plugin.id)}
                    onCheckedChange={() => togglePlugin(plugin.id)}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              You can change these later in project settings.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || slug === ORG_ADMIN_PROJECT_SLUG}
            >
              {mutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### Step 4: Integrate Dialog into Pages

Update the components that need the dialog:

**Update `apps/mesh/src/web/routes/projects-list.tsx`:**
```typescript
import { CreateProjectDialog } from "@/web/components/create-project-dialog";

// In the component:
<CreateProjectDialog 
  open={createDialogOpen} 
  onOpenChange={setCreateDialogOpen} 
/>
```

**Update `apps/mesh/src/web/components/sidebar/project-sidebar.tsx`:**
```typescript
import { CreateProjectDialog } from "@/web/components/create-project-dialog";

// In the component:
<CreateProjectDialog 
  open={createDialogOpen} 
  onOpenChange={setCreateDialogOpen} 
/>
```

### Step 5: Add Org Creation Hook

Find where organizations are created in the codebase. This is likely in Better Auth configuration or an API endpoint.

**Option A: Better Auth Hook**

If using Better Auth's organization plugin, add an `onOrganizationCreated` hook:

```typescript
// In apps/mesh/src/auth/index.ts or similar
import { createProjectsStorage } from "@/storage/projects";
import { ulid } from "ulid";

const ORG_ADMIN_PROJECT_SLUG = "org-admin";
const ORG_ADMIN_PROJECT_NAME = "Organization Admin";

// In Better Auth configuration
organization: {
  // ... existing config
  hooks: {
    organization: {
      create: {
        after: async ({ organization, db }) => {
          // Create org-admin project for the new organization
          const projectsStorage = createProjectsStorage(db);
          
          await projectsStorage.create({
            organizationId: organization.id,
            slug: ORG_ADMIN_PROJECT_SLUG,
            name: ORG_ADMIN_PROJECT_NAME,
            description: null,
            enabledPlugins: null, // Or default plugins
            ui: null,
          });
        },
      },
    },
  },
},
```

**Option B: API Endpoint Hook**

If organizations are created via a custom API endpoint:

```typescript
// In the organization creation endpoint
import { createProjectsStorage } from "@/storage/projects";

const ORG_ADMIN_PROJECT_SLUG = "org-admin";
const ORG_ADMIN_PROJECT_NAME = "Organization Admin";

// After organization is created:
const projectsStorage = createProjectsStorage(db);
await projectsStorage.create({
  organizationId: newOrg.id,
  slug: ORG_ADMIN_PROJECT_SLUG,
  name: ORG_ADMIN_PROJECT_NAME,
  description: null,
  enabledPlugins: [], // Or default plugins
  ui: null,
});
```

**Option C: Lazy Creation (Fallback)**

If you can't easily add a hook, create the project lazily when first accessed:

```typescript
// In project-layout.tsx or wherever project is loaded
const { data: project, isLoading } = useProject(org.id, projectSlug);

// If org-admin doesn't exist, create it
if (!isLoading && !project && projectSlug === ORG_ADMIN_PROJECT_SLUG) {
  // Trigger creation mutation
  createOrgAdminMutation.mutate();
}
```

### Step 6: Add Constants Export

Ensure constants are exported from a shared location:

```typescript
// packages/mesh-sdk/src/constants.ts
export const ORG_ADMIN_PROJECT_SLUG = "org-admin";
export const ORG_ADMIN_PROJECT_NAME = "Organization Admin";
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/mesh/src/web/lib/slug.ts` | Create |
| `apps/mesh/src/web/components/color-picker.tsx` | Create |
| `apps/mesh/src/web/components/create-project-dialog.tsx` | Create |
| `apps/mesh/src/web/routes/projects-list.tsx` | Modify (add dialog) |
| `apps/mesh/src/web/components/sidebar/project-sidebar.tsx` | Modify (add dialog) |
| `apps/mesh/src/auth/index.ts` or API endpoint | Modify (add org creation hook) |
| `packages/mesh-sdk/src/constants.ts` | Modify (add constants) |

## Verification

### 1. Run TypeScript Check

```bash
bun run check
```

All type errors should be resolved.

### 2. Test Project Creation Dialog

1. Navigate to `/$org/org-admin/projects`
2. Click "Create new project" button or card
3. Dialog should open
4. Fill in name - slug should auto-generate
5. Manually edit slug - should accept it
6. Select a banner color
7. Toggle some plugins
8. Click "Create Project"
9. Should navigate to new project

### 3. Test Slug Validation

1. Try entering "org-admin" as slug
2. Should show error that it's reserved
3. Try entering invalid characters
4. Should be sanitized/rejected

### 4. Test Org Creation Hook

1. Create a new organization (via UI or API)
2. Navigate to `/$new-org/org-admin`
3. org-admin project should exist automatically

### 5. Run Lint and Format

```bash
bun run fmt
bun run lint
```

No errors should be present.

### 6. Run Tests

```bash
bun test
```

All tests should pass.

## Success Criteria

- [ ] Create project dialog opens from all access points
- [ ] Name to slug auto-generation works
- [ ] Manual slug editing works
- [ ] Reserved slug validation works
- [ ] Color picker works
- [ ] Plugin selection works
- [ ] Project creation succeeds and navigates to new project
- [ ] Org creation hook creates org-admin project
- [ ] `bun run check` passes
- [ ] `bun run fmt` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes

## Notes

- Form library (react-hook-form) and validation (zod) may need installation
- Dialog component should come from your UI library
- Color picker can be simplified if needed
- Image upload for banner/icon is optional for MVP - can be added later
- The org creation hook location depends on your auth setup
