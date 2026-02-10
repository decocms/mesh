/**
 * Create Project Template Dialog
 *
 * A full-width dialog for creating a new project. Displays:
 * - Left sidebar: category navigation (All templates, My templates, Featured by Deco categories)
 * - Right content: action cards (Start from scratch, Import file, Import from GitHub)
 *   and a searchable template grid fetched from a bound template registry connection.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useConnections,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import {
  PROJECT_TEMPLATE_REGISTRY_BINDING,
  type ProjectTemplate,
} from "@decocms/bindings";
import { connectionImplementsBinding } from "@/web/hooks/use-binding";
import { Dialog, DialogContent } from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Plus, SearchMd, Download01, Grid01, User01 } from "@untitledui/icons";
import { KEYS } from "@/web/lib/query-keys";
import { CreateProjectDialog } from "./create-project-dialog";
import { TemplateOnboardingWizard } from "./template-onboarding-wizard";
import type { CollectionListOutput } from "@decocms/bindings/collections";

// ============================================================================
// Types
// ============================================================================

interface CreateProjectTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogView = "template-selection" | "onboarding";

// ============================================================================
// Hooks
// ============================================================================

/**
 * Find the first connection that implements PROJECT_TEMPLATE_REGISTRY_BINDING
 */
function useTemplateRegistryConnection() {
  const connections = useConnections();
  if (!connections) return null;
  return (
    connections.find((conn) =>
      connectionImplementsBinding(
        conn,
        PROJECT_TEMPLATE_REGISTRY_BINDING as never,
      ),
    ) ?? null
  );
}

/**
 * Fetch templates from the registry connection
 */
function useTemplates(registryConnectionId: string | null, search: string) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: registryConnectionId,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.toolCall(
      registryConnectionId ?? "no-registry",
      "COLLECTION_PROJECT_TEMPLATE_LIST",
      JSON.stringify({ search }),
    ),
    queryFn: async () => {
      const searchWhere = search.trim()
        ? {
            operator: "or" as const,
            conditions: [
              {
                field: ["title"],
                operator: "contains" as const,
                value: search,
              },
              {
                field: ["description"],
                operator: "contains" as const,
                value: search,
              },
            ],
          }
        : undefined;

      const result = (await client.callTool({
        name: "COLLECTION_PROJECT_TEMPLATE_LIST",
        arguments: {
          limit: 100,
          ...(searchWhere && { where: searchWhere }),
        },
      })) as { structuredContent?: unknown };

      const payload = (result.structuredContent ??
        result) as CollectionListOutput<ProjectTemplate>;
      return payload.items ?? [];
    },
    enabled: !!registryConnectionId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Sub-components
// ============================================================================

/** GitHub icon (inline SVG since @untitledui/icons may not have it) */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.138 18.163 20 14.418 20 10c0-5.523-4.477-10-10-10z"
      />
    </svg>
  );
}

/** Sidebar category item */
function CategoryItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left",
        active
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent/50",
      )}
    >
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

/** Action card for Start from scratch / Import file / Import from github */
function ActionCard({
  icon,
  label,
  onClick,
  disabled,
  disabledReason,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const card = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background h-[200px] min-w-0 transition-colors",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-accent/30 cursor-pointer",
      )}
    >
      <div className="text-foreground">{icon}</div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }

  return card;
}

/** Template card in the grid */
function TemplateCard({
  template,
  onClick,
}: {
  template: ProjectTemplate;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2.5 items-start text-left w-full group cursor-pointer"
    >
      <div
        className="w-full rounded-lg aspect-[384/236]"
        style={{
          backgroundColor: template.iconColor ?? "var(--muted)",
        }}
      />
      <div className="flex items-center gap-4 w-full">
        <div
          className="size-6 rounded-md shrink-0"
          style={{
            backgroundColor: template.iconColor ?? "var(--muted)",
          }}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {template.title}
          </span>
          {template.description && (
            <span className="text-xs text-muted-foreground truncate">
              {template.description}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CreateProjectTemplateDialog({
  open,
  onOpenChange,
}: CreateProjectTemplateDialogProps) {
  const [view, setView] = useState<DialogView>("template-selection");
  const [selectedTemplate, setSelectedTemplate] =
    useState<ProjectTemplate | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showScratchDialog, setShowScratchDialog] = useState(false);

  // Find template registry connection
  const registryConnection = useTemplateRegistryConnection();
  const { data: templates = [], isLoading } = useTemplates(
    registryConnection?.id ?? null,
    searchQuery,
  );

  // Extract unique categories from templates
  const categories = Array.from(
    new Set(templates.map((t) => t.category).filter(Boolean)),
  ).sort();

  // Filter templates by selected category
  const filteredTemplates = selectedCategory
    ? templates.filter((t) => t.category === selectedCategory)
    : templates;

  const handleSelectTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setView("onboarding");
  };

  const handleStartFromScratch = () => {
    onOpenChange(false);
    setShowScratchDialog(true);
  };

  const handleBackToSelection = () => {
    setView("template-selection");
    setSelectedTemplate(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after animation
    setTimeout(() => {
      setView("template-selection");
      setSelectedTemplate(null);
      setSelectedCategory(null);
      setSearchQuery("");
    }, 200);
  };

  const handleScratchDialogClose = (isOpen: boolean) => {
    setShowScratchDialog(isOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-5xl h-[80vh] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden w-[95vw] rounded-2xl">
          {view === "template-selection" ? (
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Left Sidebar */}
              <div className="w-[224px] shrink-0 border-r border-border flex flex-col gap-4 p-4 overflow-y-auto">
                {/* Top menu items */}
                <div className="flex flex-col gap-0.5">
                  <CategoryItem
                    label="All templates"
                    active={selectedCategory === null}
                    onClick={() => setSelectedCategory(null)}
                  />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left text-foreground/80 hover:bg-accent/50"
                    disabled
                  >
                    <User01 size={16} className="shrink-0 opacity-60" />
                    <span className="flex-1 truncate opacity-60">
                      My templates
                    </span>
                  </button>
                </div>

                {/* Category list */}
                {categories.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-2 py-1.5">
                      <span className="text-xs font-mono text-muted-foreground">
                        FEATURED BY DECO
                      </span>
                    </div>
                    {categories.map((category) => (
                      <CategoryItem
                        key={category}
                        label={category}
                        active={selectedCategory === category}
                        onClick={() => setSelectedCategory(category)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Right Content */}
              <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
                {/* Top Section: Action Cards */}
                <div className="flex flex-col gap-4 p-5 shrink-0">
                  <h2 className="text-base font-medium text-foreground">
                    Create a new project
                  </h2>
                  <div className="flex gap-4">
                    <ActionCard
                      icon={<Plus size={24} />}
                      label="Start from scratch"
                      onClick={handleStartFromScratch}
                    />
                    <ActionCard
                      icon={<Download01 size={24} />}
                      label="Import file"
                      disabled
                      disabledReason="Coming soon"
                    />
                    <ActionCard
                      icon={<GitHubIcon className="size-5" />}
                      label="Import from github"
                      disabled
                      disabledReason="Coming soon"
                    />
                  </div>
                </div>

                {/* Templates Section */}
                <div className="flex flex-col flex-1 min-h-0">
                  {/* Templates Header */}
                  <div className="flex items-center gap-2.5 h-12 px-5 border-y border-border shrink-0">
                    <h3 className="flex-1 text-base font-medium text-foreground">
                      Templates
                    </h3>
                    <SearchMd size={16} className="text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search for a template..."
                      className="w-[300px] h-8 border-0 shadow-none focus-visible:ring-0 text-sm"
                    />
                  </div>

                  {/* Templates Grid */}
                  <div className="p-5 overflow-y-auto flex-1">
                    {!registryConnection ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Grid01
                          size={32}
                          className="text-muted-foreground/40 mb-3"
                        />
                        <p className="text-sm text-muted-foreground">
                          No template registry connected
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          Connect a template registry to browse project
                          templates
                        </p>
                      </div>
                    ) : isLoading ? (
                      <div className="grid grid-cols-3 gap-x-4 gap-y-8">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={`skeleton-${i}`}
                            className="flex flex-col gap-2.5"
                          >
                            <div className="w-full rounded-lg aspect-[384/236] bg-muted animate-pulse" />
                            <div className="flex items-center gap-4">
                              <div className="size-6 rounded-md bg-muted animate-pulse" />
                              <div className="flex flex-col gap-1 flex-1">
                                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                                <div className="h-3 w-40 bg-muted animate-pulse rounded" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : filteredTemplates.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <SearchMd
                          size={32}
                          className="text-muted-foreground/40 mb-3"
                        />
                        <p className="text-sm text-muted-foreground">
                          {searchQuery
                            ? "No templates match your search"
                            : "No templates available"}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-x-4 gap-y-8">
                        {filteredTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onClick={() => handleSelectTemplate(template)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <TemplateOnboardingWizard
              template={selectedTemplate!}
              onBack={handleBackToSelection}
              onClose={handleClose}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Existing Create Project Dialog (for Start from scratch) */}
      <CreateProjectDialog
        open={showScratchDialog}
        onOpenChange={handleScratchDialogClose}
      />
    </>
  );
}
