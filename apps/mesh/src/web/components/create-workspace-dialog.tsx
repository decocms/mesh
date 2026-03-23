/**
 * Create Workspace Dialog
 *
 * Two-step flow:
 * 1. Pick workspace type (Slides, Website, Blank)
 * 2. Name the workspace + pick color
 *
 * For typed workspaces (slides/website), auto-creates the matching agent
 * and installs required connections. For "Blank", delegates to the
 * existing CreateProjectDialog.
 */

import { getDefaultAgentSpecs } from "@/constants/default-agents";
import { useInstallFromRegistry } from "@/web/hooks/use-install-from-registry";
import { createWorkspaceWithAgent } from "@/web/lib/create-workspace-with-agent";
import { generateSlug, isValidSlug } from "@/web/lib/slug";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ORG_ADMIN_PROJECT_SLUG,
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useConnectionActions,
  useProjectContext,
  useVirtualMCPActions,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ColorPicker } from "./color-picker";

// ---------------------------------------------------------------------------
// Workspace type definitions
// ---------------------------------------------------------------------------

interface WorkspaceTypeOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  workspaceType: string | null;
  /** Agent spec title to auto-attach (from DefaultAgentSpec catalog) */
  agentSpecTitle?: string;
}

const WORKSPACE_TYPES: WorkspaceTypeOption[] = [
  {
    id: "slides",
    label: "Slides",
    description: "Build presentation decks with AI assistance",
    icon: "icon://PresentationChart01?color=blue",
    workspaceType: "slides",
    agentSpecTitle: "Slide Builder",
  },
  {
    id: "website",
    label: "Website",
    description: "Build and manage websites with CMS, pages, and assets",
    icon: "icon://Globe01?color=green",
    workspaceType: "website",
    agentSpecTitle: "deco.cx",
  },
  {
    id: "blank",
    label: "Blank",
    description: "Start with a blank workspace and add what you need",
    icon: "icon://File06?color=gray",
    workspaceType: null,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const virtualMcps = useVirtualMCPs();
  const virtualMCPActions = useVirtualMCPActions();
  const connectionActions = useConnectionActions();
  const { installByAppName } = useInstallFromRegistry();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const [step, setStep] = useState<"type" | "name">("type");
  const [selectedType, setSelectedType] = useState<WorkspaceTypeOption | null>(
    null,
  );
  const [name, setName] = useState("");
  const [bannerColor, setBannerColor] = useState("#3B82F6");
  const [isCreating, setIsCreating] = useState(false);

  const slug = generateSlug(name);
  const isSlugValid = slug.length > 0 && isValidSlug(slug);
  const isSlugReserved = slug === ORG_ADMIN_PROJECT_SLUG;

  const reset = () => {
    setStep("type");
    setSelectedType(null);
    setName("");
    setBannerColor("#3B82F6");
    setIsCreating(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  const handleTypeSelect = (type: WorkspaceTypeOption) => {
    setSelectedType(type);
    setStep("name");
  };

  const handleCreate = async () => {
    if (!selectedType || !name || isCreating) return;
    setIsCreating(true);

    try {
      if (selectedType.workspaceType && selectedType.agentSpecTitle) {
        // Typed workspace — find matching agent spec and auto-create
        const allSpecs = getDefaultAgentSpecs();
        const spec = allSpecs.find(
          (s) => s.title === selectedType.agentSpecTitle,
        );

        if (!spec) {
          throw new Error(
            `Agent spec "${selectedType.agentSpecTitle}" not found`,
          );
        }

        const result = await createWorkspaceWithAgent({
          spec,
          workspaceType: selectedType.workspaceType,
          workspaceName: name,
          org,
          client,
          connectionActions,
          virtualMCPActions,
          installByAppName,
          existingVirtualMcps: virtualMcps as Array<{
            id: string;
            title: string;
            metadata?: Record<string, unknown> | null;
            connections?: unknown[];
          }>,
        });

        handleClose(false);

        navigate({
          to: "/$org/$project",
          params: { org: org.slug, project: result.projectSlug },
          search:
            result.oauthConnections.length > 0
              ? {
                  setupConnections: JSON.stringify(result.oauthConnections),
                }
              : {},
        });
      } else {
        // Blank workspace — create project directly (no agent)
        const result = (await client.callTool({
          name: "PROJECT_CREATE",
          arguments: {
            organizationId: org.id,
            slug,
            name,
            description: null,
            enabledPlugins: [],
            ui: {
              banner: null,
              bannerColor,
              icon: null,
              themeColor: bannerColor,
              workspaceType: null,
            },
          },
        })) as { structuredContent?: unknown };
        const payload = (result.structuredContent ?? result) as {
          project: { slug: string };
        };

        handleClose(false);

        navigate({
          to: "/$org/$project",
          params: { org: org.slug, project: payload.project.slug },
        });
      }

      toast.success(`Workspace "${name}" created`);
    } catch (err) {
      console.error("[CreateWorkspaceDialog] Failed:", err);
      toast.error(
        `Failed to create workspace: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {step === "type" ? (
          <>
            <DialogHeader>
              <DialogTitle>New Workspace</DialogTitle>
              <DialogDescription>
                Choose what you want to build.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              {WORKSPACE_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleTypeSelect(type)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-lg border border-border",
                    "text-left transition-colors",
                    "hover:bg-accent hover:border-accent-foreground/20",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  )}
                >
                  <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0 text-lg">
                    {type.id === "slides"
                      ? "S"
                      : type.id === "website"
                        ? "W"
                        : "B"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {type.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {type.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                Name your {selectedType?.label ?? "workspace"}
              </DialogTitle>
              <DialogDescription>
                {selectedType?.workspaceType
                  ? `A ${selectedType.label} workspace will be created with the ${selectedType.agentSpecTitle} agent.`
                  : "Give your workspace a name to get started."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Preview banner */}
              <div
                className="h-16 rounded-lg relative"
                style={{ backgroundColor: bannerColor }}
              >
                <div className="absolute -bottom-3 left-3">
                  <div
                    className="size-10 rounded-lg border-2 border-background flex items-center justify-center text-sm font-semibold text-white"
                    style={{ backgroundColor: bannerColor }}
                  >
                    {name?.charAt(0)?.toUpperCase() ||
                      selectedType?.label.charAt(0) ||
                      "W"}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label>Color</Label>
                <ColorPicker
                  value={bannerColor}
                  onChange={(color) => setBannerColor(color ?? "#3B82F6")}
                />
              </div>

              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    selectedType?.id === "slides"
                      ? "My Pitch Deck"
                      : selectedType?.id === "website"
                        ? "acme.com"
                        : "My Project"
                  }
                  autoFocus
                  disabled={isCreating}
                />
                {name && !isSlugValid && (
                  <p className="text-xs text-muted-foreground">
                    Slug: {slug || "(invalid)"}
                  </p>
                )}
                {isSlugReserved && (
                  <p className="text-xs text-destructive">
                    This name is reserved
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("type")}
                disabled={isCreating}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={isCreating || !name || !isSlugValid || isSlugReserved}
              >
                {isCreating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
