/**
 * Template Onboarding Wizard
 *
 * Multi-step wizard shown after selecting a project template.
 * Steps:
 * 1. Template overview with plugin list
 * 2..N. Plugin connection setup for each plugin requiring an MCP binding
 * N+1. Project details (name, slug, description)
 * Submit: Creates project with enabledPlugins + plugin configs
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ORG_ADMIN_PROJECT_SLUG,
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import type { ProjectTemplate, TemplatePlugin } from "@decocms/bindings";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft, Check, ChevronRight, Container } from "@untitledui/icons";
import { KEYS } from "@/web/lib/query-keys";
import { generateSlug, isValidSlug } from "@/web/lib/slug";
import { BindingSelector } from "./binding-selector";
import { sourcePlugins } from "@/web/plugins";
import { pluginRootSidebarItems } from "@/web/index";
import type { Project } from "@/web/hooks/use-project";

// ============================================================================
// Types
// ============================================================================

interface TemplateOnboardingWizardProps {
  template: ProjectTemplate;
  onBack: () => void;
  onClose: () => void;
}

type WizardStep = "overview" | "connections" | "details";

type ProjectCreateOutput = { project: Project };

const projectFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  slug: z.string().min(1, "Slug is required").max(100),
  description: z.string().max(1000).optional(),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

// ============================================================================
// Helpers
// ============================================================================

/** Get plugin metadata from sidebar items */
function getPluginMeta(pluginId: string) {
  return pluginRootSidebarItems.find((item) => item.pluginId === pluginId);
}

/** Get source plugin definition */
function getSourcePlugin(pluginId: string) {
  return sourcePlugins.find((p) => p.id === pluginId);
}

/** Check if a plugin requires an MCP binding */
function pluginRequiresBinding(pluginId: string): boolean {
  const plugin = getSourcePlugin(pluginId);
  if (!plugin) return false;
  if (
    (plugin as { requiresMcpBinding?: boolean }).requiresMcpBinding === true
  ) {
    return true;
  }
  return plugin.binding !== undefined;
}

/** Get plugins that require connection setup */
function getPluginsRequiringConnections(
  templatePlugins: TemplatePlugin[],
): TemplatePlugin[] {
  return templatePlugins.filter((tp) => pluginRequiresBinding(tp.pluginId));
}

// ============================================================================
// Sub-components
// ============================================================================

/** Step indicator in the wizard header */
function StepIndicator({
  steps,
  currentIndex,
}: {
  steps: { key: string; label: string }[];
  currentIndex: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center justify-center size-6 rounded-full text-xs font-medium",
              i < currentIndex
                ? "bg-primary text-primary-foreground"
                : i === currentIndex
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < currentIndex ? <Check size={14} /> : i + 1}
          </div>
          <span
            className={cn(
              "text-sm",
              i === currentIndex
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

/** Overview step showing template info and plugins */
function OverviewStep({ template }: { template: ProjectTemplate }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Template header */}
      <div className="flex items-start gap-4">
        <div
          className="size-12 rounded-lg shrink-0"
          style={{
            backgroundColor: template.iconColor ?? "var(--muted)",
          }}
        />
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-lg font-medium text-foreground">
            {template.title}
          </h3>
          {template.description && (
            <p className="text-sm text-muted-foreground">
              {template.description}
            </p>
          )}
          <span className="text-xs text-muted-foreground">
            {template.category}
          </span>
        </div>
      </div>

      {/* Plugin list */}
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium text-foreground">
          Included plugins
        </h4>
        <div className="divide-y divide-border border-y border-border">
          {template.plugins.map((tp) => {
            const meta = getPluginMeta(tp.pluginId);
            const plugin = getSourcePlugin(tp.pluginId);
            const needsConnection = pluginRequiresBinding(tp.pluginId);

            return (
              <div key={tp.pluginId} className="flex items-center gap-3 py-3">
                <div className="flex-shrink-0 text-muted-foreground [&>svg]:size-4">
                  {meta?.icon ?? <Container size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {meta?.label ?? tp.pluginId}
                  </div>
                  {plugin?.description && (
                    <p className="text-xs text-muted-foreground">
                      {plugin.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {needsConnection && (
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Requires connection
                    </span>
                  )}
                  {tp.required !== false && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      Required
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Connection setup step for plugins requiring MCP bindings */
function ConnectionsStep({
  template,
  connectionBindings,
  onConnectionChange,
}: {
  template: ProjectTemplate;
  connectionBindings: Record<string, string | null>;
  onConnectionChange: (pluginId: string, connectionId: string | null) => void;
}) {
  const pluginsNeedingConnections = getPluginsRequiringConnections(
    template.plugins,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-medium text-foreground">
          Connect your services
        </h3>
        <p className="text-sm text-muted-foreground">
          Select or create connections for the plugins in this template.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {pluginsNeedingConnections.map((tp) => {
          const meta = getPluginMeta(tp.pluginId);
          const plugin = getSourcePlugin(tp.pluginId);

          return (
            <div
              key={tp.pluginId}
              className="flex flex-col gap-3 p-4 rounded-lg border border-border"
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 text-muted-foreground [&>svg]:size-4">
                  {meta?.icon ?? <Container size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {meta?.label ?? tp.pluginId}
                  </div>
                  {plugin?.description && (
                    <p className="text-xs text-muted-foreground">
                      {plugin.description}
                    </p>
                  )}
                </div>
                {tp.required === false && (
                  <span className="text-xs text-muted-foreground">
                    Optional
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 pl-7">
                <Label className="text-xs text-muted-foreground w-24">
                  Connection
                </Label>
                <BindingSelector
                  value={connectionBindings[tp.pluginId] ?? null}
                  onValueChange={(value) =>
                    onConnectionChange(tp.pluginId, value)
                  }
                  binding={plugin?.binding}
                  bindingType={tp.defaultConnectionAppId ?? undefined}
                  placeholder="Select connection..."
                  className="w-64"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Project details form step */
function DetailsStep({
  form,
  slugManuallyEdited,
  onSlugManuallyEdited,
  orgSlug,
  isPending,
  bannerColor,
}: {
  form: ReturnType<typeof useForm<ProjectFormData>>;
  slugManuallyEdited: boolean;
  onSlugManuallyEdited: (v: boolean) => void;
  orgSlug: string;
  isPending: boolean;
  bannerColor: string;
}) {
  const name = form.watch("name");
  const slug = form.watch("slug");
  const isSlugReserved = slug === ORG_ADMIN_PROJECT_SLUG;
  const isSlugInvalid = slug.length > 0 && !isValidSlug(slug);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    form.setValue("name", newName);
    if (!slugManuallyEdited) {
      form.setValue("slug", generateSlug(newName));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSlugManuallyEdited(true);
    form.setValue(
      "slug",
      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-medium text-foreground">Project details</h3>
        <p className="text-sm text-muted-foreground">
          Give your new project a name and description.
        </p>
      </div>

      {/* Banner Preview */}
      <div
        className="h-20 rounded-lg relative"
        style={{ backgroundColor: bannerColor }}
      >
        <div className="absolute -bottom-4 left-4">
          <div
            className="size-12 rounded-lg border-2 border-background flex items-center justify-center text-lg font-semibold text-white"
            style={{ backgroundColor: bannerColor }}
          >
            {name?.charAt(0)?.toUpperCase() || "P"}
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="name"
          render={() => (
            <FormItem>
              <FormLabel>Project Name *</FormLabel>
              <FormControl>
                <Input
                  value={name}
                  onChange={handleNameChange}
                  placeholder="My Awesome Project"
                  autoFocus
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={() => (
            <FormItem>
              <FormLabel>Slug *</FormLabel>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  /{orgSlug}/
                </span>
                <FormControl>
                  <Input
                    value={slug}
                    onChange={handleSlugChange}
                    placeholder="my-awesome-project"
                    className="flex-1"
                    disabled={isPending}
                  />
                </FormControl>
              </div>
              {isSlugReserved && (
                <p className="text-xs text-destructive">
                  &quot;{ORG_ADMIN_PROJECT_SLUG}&quot; is a reserved slug
                </p>
              )}
              {isSlugInvalid && !isSlugReserved && (
                <p className="text-xs text-destructive">
                  Slug must be lowercase alphanumeric with hyphens only
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="What is this project for?"
                  rows={2}
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TemplateOnboardingWizard({
  template,
  onBack,
  onClose,
}: TemplateOnboardingWizardProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Wizard state
  const pluginsNeedingConnections = getPluginsRequiringConnections(
    template.plugins,
  );
  const hasConnectionStep = pluginsNeedingConnections.length > 0;

  const [currentStep, setCurrentStep] = useState<WizardStep>("overview");
  const [connectionBindings, setConnectionBindings] = useState<
    Record<string, string | null>
  >({});
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const form = useForm<ProjectFormData>({
    mode: "onChange",
    defaultValues: {
      name: "",
      slug: "",
      description: "",
    },
  });

  const bannerColor =
    template.ui?.bannerColor ?? template.iconColor ?? "#3B82F6";

  // Build step list
  const steps: { key: WizardStep; label: string }[] = [
    { key: "overview", label: "Overview" },
    ...(hasConnectionStep
      ? [{ key: "connections" as WizardStep, label: "Connections" }]
      : []),
    { key: "details", label: "Project Details" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  // Navigation
  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    const nextStep = steps[nextIndex];
    if (nextStep) {
      setCurrentStep(nextStep.key);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    const prevStep = steps[prevIndex];
    if (prevStep) {
      setCurrentStep(prevStep.key);
    } else {
      onBack();
    }
  };

  // Create project mutation
  const mutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      // 1. Create project with enabled plugins from template
      const enabledPluginIds = template.plugins.map((tp) => tp.pluginId);
      const createResult = (await client.callTool({
        name: "PROJECT_CREATE",
        arguments: {
          organizationId: org.id,
          slug: data.slug,
          name: data.name,
          description: data.description || null,
          enabledPlugins: enabledPluginIds,
          ui: {
            banner: null,
            bannerColor: bannerColor,
            icon: null,
            themeColor: bannerColor,
          },
        },
      })) as { structuredContent?: unknown };

      const payload = (createResult.structuredContent ??
        createResult) as ProjectCreateOutput;
      const project = payload.project;

      // 2. Set plugin connection bindings
      const bindingUpdates = Object.entries(connectionBindings).filter(
        ([, connectionId]) => connectionId !== null,
      );

      if (bindingUpdates.length > 0) {
        await Promise.all(
          bindingUpdates.map(async ([pluginId, connectionId]) => {
            await client.callTool({
              name: "PROJECT_PLUGIN_CONFIG_UPDATE",
              arguments: {
                projectId: project.id,
                pluginId,
                connectionId,
              },
            });
          }),
        );
      }

      return payload;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: KEYS.projects(org.id) });
      toast.success("Project created from template");
      onClose();
      navigate({
        to: "/$org/$project",
        params: { org: org.slug, project: result.project.slug },
      });
    },
    onError: (error) => {
      toast.error(
        "Failed to create project: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  const handleSubmit = async () => {
    const data = form.getValues();

    // Validate
    if (!data.name || !data.slug) {
      toast.error("Please fill in the project name and slug");
      return;
    }
    if (!isValidSlug(data.slug)) {
      form.setError("slug", {
        message: "Slug must be lowercase alphanumeric with hyphens only",
      });
      return;
    }
    if (data.slug === ORG_ADMIN_PROJECT_SLUG) {
      form.setError("slug", {
        message: `"${ORG_ADMIN_PROJECT_SLUG}" is a reserved slug`,
      });
      return;
    }

    await mutation.mutateAsync(data);
  };

  const handleConnectionChange = (
    pluginId: string,
    connectionId: string | null,
  ) => {
    setConnectionBindings((prev) => ({ ...prev, [pluginId]: connectionId }));
  };

  const name = form.watch("name");
  const slug = form.watch("slug");
  const isSlugValid = slug.length > 0 && isValidSlug(slug);
  const canSubmit = name.length > 0 && isSlugValid && !mutation.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-border shrink-0">
        <button
          type="button"
          onClick={goPrev}
          className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <StepIndicator steps={steps} currentIndex={currentStepIndex} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (currentStep === "details") {
                handleSubmit();
              }
            }}
          >
            {currentStep === "overview" && <OverviewStep template={template} />}
            {currentStep === "connections" && (
              <ConnectionsStep
                template={template}
                connectionBindings={connectionBindings}
                onConnectionChange={handleConnectionChange}
              />
            )}
            {currentStep === "details" && (
              <DetailsStep
                form={form}
                slugManuallyEdited={slugManuallyEdited}
                onSlugManuallyEdited={setSlugManuallyEdited}
                orgSlug={org.slug}
                isPending={mutation.isPending}
                bannerColor={bannerColor}
              />
            )}
          </form>
        </Form>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
        <Button type="button" variant="outline" onClick={goPrev}>
          {currentStepIndex === 0 ? "Back to templates" : "Previous"}
        </Button>

        {currentStep === "details" ? (
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {mutation.isPending ? "Creating..." : "Create Project"}
          </Button>
        ) : (
          <Button type="button" onClick={goNext}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
