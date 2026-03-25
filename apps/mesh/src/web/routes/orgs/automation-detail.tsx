/**
 * Automation Detail Page
 *
 * Settings and run history for a single automation on one page.
 */

import { EmptyState } from "@/web/components/empty-state.tsx";
import { ViewActions, ViewLayout } from "@/web/components/details/layout";
import { SaveActions } from "@/web/components/save-actions";
import {
  useAiProviderModels,
  type AiProviderModel,
} from "@/web/hooks/collections/use-llm.ts";
import { ModelSelector } from "@/web/components/chat/select-model.tsx";
import { VirtualMCPPopoverContent } from "@/web/components/chat/select-virtual-mcp.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { User } from "@/web/components/user/user.tsx";
import {
  useAutomationDetail,
  useAutomationUpdate,
  useAutomationDelete,
  useAutomationTriggerAdd,
} from "@/web/hooks/use-automations";
import { useChat } from "@/web/components/chat/index";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@deco/ui/components/breadcrumb.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { getDecopilotId, useProjectContext } from "@decocms/mesh-sdk";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowUp,
  Clock,
  Loading01,
  Stars01,
  Trash01,
  Users03,
  XClose,
} from "@untitledui/icons";
import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { useVirtualMCPs, isDecopilot } from "@decocms/mesh-sdk";
import type { Metadata } from "@/web/components/chat/types.ts";
import {
  TiptapProvider,
  TiptapInput,
} from "@/web/components/chat/tiptap/input.tsx";
import {
  derivePartsFromTiptapDoc,
  tiptapDocToMessages,
} from "@/web/components/chat/derive-parts.ts";
import { chatStore } from "@/web/components/chat/store/chat-store";

// ============================================================================
// Types
// ============================================================================

interface SettingsFormData {
  name: string;
  active: boolean;
  agent_id: string;
  credential_id: string;
  model_id: string;
}

// ============================================================================
// Helpers (shared)
// ============================================================================

import { isValidCron } from "@/web/lib/cron-utils.ts";
import { AddStarterPopover } from "@/web/components/automations/add-starter-popover.tsx";
import { TriggerCard } from "@/web/components/automations/trigger-card.tsx";

// ============================================================================
// Agent Picker
// ============================================================================

function AgentPicker({
  selectedId,
  onChange,
}: {
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const allVirtualMcps = useVirtualMCPs();
  const virtualMcps = allVirtualMcps.filter((v) => !v.id || !isDecopilot(v.id));
  const selected = selectedId
    ? virtualMcps.find((v) => v.id === selectedId)
    : null;

  if (selected) {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
            >
              <IntegrationIcon
                icon={selected.icon}
                name={selected.title}
                size="sm"
                fallbackIcon={<Users03 size={16} />}
                className="rounded-md shrink-0"
              />
              <span className="text-sm font-medium truncate">
                {selected.title}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[550px] p-0 overflow-hidden"
            align="start"
            sideOffset={8}
          >
            <VirtualMCPPopoverContent
              virtualMcps={virtualMcps}
              selectedVirtualMcpId={selectedId}
              onVirtualMcpChange={(id) => {
                onChange(id);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 size-7 text-muted-foreground hover:text-foreground"
          onClick={() => onChange(null)}
          title="Remove agent"
        >
          <XClose size={13} />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-accent/50 transition-colors w-full text-left cursor-pointer"
        >
          <div className="relative flex items-center justify-center size-8 rounded-md text-muted-foreground/75 shrink-0">
            <svg className="absolute inset-0 size-full" fill="none">
              <defs>
                <linearGradient
                  id="agent-picker-border-gradient"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="32"
                  y2="32"
                >
                  <animateTransform
                    attributeName="gradientTransform"
                    type="rotate"
                    from="0 16 16"
                    to="360 16 16"
                    dur="6s"
                    repeatCount="indefinite"
                  />
                  <stop offset="0%" stopColor="var(--chart-1)" />
                  <stop offset="100%" stopColor="var(--chart-4)" />
                </linearGradient>
              </defs>
              <rect
                x="0.5"
                y="0.5"
                width="31"
                height="31"
                rx="5.5"
                stroke="url(#agent-picker-border-gradient)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </svg>
            <Users03 size={16} />
          </div>
          <span className="text-sm text-muted-foreground">
            No agent selected. All connections available.
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[550px] p-0 overflow-hidden"
        align="start"
        sideOffset={8}
      >
        <VirtualMCPPopoverContent
          virtualMcps={virtualMcps}
          selectedVirtualMcpId={selectedId}
          onVirtualMcpChange={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Settings Tab
// ============================================================================

export function SettingsTab({
  automationId,
  automation,
  fixedAgentId,
  embedded,
}: {
  automationId: string;
  automation: NonNullable<ReturnType<typeof useAutomationDetail>["data"]>;
  fixedAgentId?: string;
  embedded?: boolean;
}) {
  const { org } = useProjectContext();
  const updateMutation = useAutomationUpdate();

  // Chat hooks for running the automation
  const {
    createTask,
    setVirtualMcpId,
    setSelectedModel,
    sendMessage,
    credentialId: chatCredentialId,
    model: chatModel,
  } = useChat();
  const [, setChatOpen] = useDecoChatOpen();

  const initialTiptapDoc =
    (automation.messages?.[0] as { metadata?: Metadata } | undefined)?.metadata
      ?.tiptapDoc ?? undefined;
  const [tiptapDoc, setTiptapDocRaw] =
    useState<Metadata["tiptapDoc"]>(initialTiptapDoc);
  const [savedDoc, setSavedDoc] = useState(initialTiptapDoc);
  const [starterOpen, setStarterOpen] = useState(false);
  const [showCustomCron, setShowCustomCron] = useState(false);
  const [cronInput, setCronInput] = useState("");
  const addTrigger = useAutomationTriggerAdd();
  const editorInitializedRef = useRef(false);

  const setTiptapDoc = (doc: Metadata["tiptapDoc"]) => {
    setTiptapDocRaw(doc);
    if (!editorInitializedRef.current) {
      editorInitializedRef.current = true;
      if (!initialTiptapDoc) {
        setSavedDoc(doc);
      }
    }
  };

  const handleImprovePrompt = () => {
    const parts = derivePartsFromTiptapDoc(tiptapDoc);
    const instructionsText = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (!instructionsText.trim()) return;

    setChatOpen(true);

    chatStore.createThreadAndSend({
      parts: [
        {
          type: "text",
          text: `/writing-prompts for automation with id ${automationId}. The current message is\n\n<message>\n${instructionsText}\n</message>`,
        },
      ],
      agent: {
        id: getDecopilotId(org.id),
        title: "Decopilot",
        description: null,
        icon: null,
      },
      toolApprovalLevel: "plan",
    });
  };

  const defaultCredentialId =
    automation.models?.credentialId || chatCredentialId || "";
  const defaultModelId =
    automation.models?.thinking?.id || chatModel?.modelId || "";

  const form = useForm<SettingsFormData>({
    defaultValues: {
      name: automation.name,
      active: automation.active,
      agent_id: fixedAgentId ?? automation.agent?.id ?? "",
      credential_id: defaultCredentialId,
      model_id: defaultModelId,
    },
  });

  const watchActive = form.watch("active");
  const watchAgentId = form.watch("agent_id");
  const watchConnectionId = form.watch("credential_id");
  const watchModelId = form.watch("model_id");

  const { models, isLoading: isModelsLoading } = useAiProviderModels(
    watchConnectionId || undefined,
  );
  const selectedModel: AiProviderModel | null =
    models.find((m) => m.modelId === watchModelId) ?? null;

  const handleSave = async (): Promise<boolean> => {
    const values = form.getValues();
    try {
      const coercedCredentialId =
        values.credential_id && values.model_id ? values.credential_id : "";
      const coercedModelId =
        values.credential_id && values.model_id ? values.model_id : "";

      await updateMutation.mutateAsync({
        id: automationId,
        name: values.name,
        active: values.active,
        agent: {
          id: fixedAgentId ?? values.agent_id,
        },
        models: {
          credentialId: coercedCredentialId,
          thinking: {
            id: coercedModelId,
          },
        },
        messages: tiptapDocToMessages(tiptapDoc),
        temperature: 0,
      });
      form.reset({
        ...values,
        credential_id: coercedCredentialId,
        model_id: coercedModelId,
      });
      setSavedDoc(tiptapDoc);
      toast.success("Automation saved");
      return true;
    } catch {
      toast.error("Failed to save automation");
      return false;
    }
  };

  const handleUndo = () => {
    form.reset();
    setTiptapDoc(savedDoc);
  };

  const isDirty =
    form.formState.isDirty ||
    JSON.stringify(tiptapDoc ?? null) !== JSON.stringify(savedDoc ?? null);

  const handleRunClick = async () => {
    if (isDirty) {
      const saved = await handleSave();
      if (!saved) return;
    }

    if (!tiptapDoc) {
      toast.error("No instructions configured for this automation");
      return;
    }

    const values = form.getValues();

    setVirtualMcpId((fixedAgentId ?? values.agent_id) || null);
    if (selectedModel && watchConnectionId) {
      setSelectedModel({ ...selectedModel, keyId: watchConnectionId });
    }

    setChatOpen(true);
    createTask();

    setTimeout(() => {
      sendMessage(tiptapDoc, { toolApprovalLevel: "auto" });
    }, 0);
  };

  return (
    <>
      {embedded ? (
        isDirty && (
          <div className="flex items-center justify-end gap-2 px-6 pt-4">
            <SaveActions
              onSave={async () => {
                await handleSave();
              }}
              onUndo={handleUndo}
              isDirty={isDirty}
              isSaving={updateMutation.isPending}
            />
          </div>
        )
      ) : (
        <ViewActions>
          <SaveActions
            onSave={async () => {
              await handleSave();
            }}
            onUndo={handleUndo}
            isDirty={isDirty}
            isSaving={updateMutation.isPending}
          />
        </ViewActions>
      )}

      <div className="max-w-2xl mx-auto w-full px-6 py-6 flex flex-col gap-8">
        {/* Header: Name + Status + Creator */}
        <div className="flex flex-col gap-1.5">
          <Input
            {...form.register("name")}
            placeholder="Automation name"
            className="border border-transparent shadow-none px-0 text-2xl md:text-2xl font-semibold h-auto focus-visible:ring-0 focus-visible:border-border bg-transparent"
          />
          <div className="flex items-center gap-2">
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="cursor-pointer"
                />
              )}
            />
            <span className="text-sm text-muted-foreground">
              {watchActive ? "Active" : "Inactive"}
            </span>
            <span className="text-muted-foreground/50 text-sm">·</span>
            <User
              id={automation.created_by}
              size="2xs"
              className="text-sm text-muted-foreground"
            />
          </div>
        </div>

        {/* Section: Starter (was Triggers) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground/60">
              Starter
            </span>
            <AddStarterPopover
              automationId={automationId}
              open={starterOpen}
              onOpenChange={setStarterOpen}
              onCustomSelect={() => {
                setShowCustomCron(true);
                setCronInput("");
              }}
            />
          </div>

          {automation.triggers.length === 0 && !showCustomCron ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                When should this automation run?{" "}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2 cursor-pointer hover:text-foreground/80 transition-colors"
                  onClick={() => setStarterOpen(true)}
                >
                  Add a starter
                </button>{" "}
                to get going.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {automation.triggers.map((trigger) => (
                <TriggerCard
                  key={trigger.id}
                  trigger={trigger}
                  automationId={automationId}
                />
              ))}
            </div>
          )}

          {showCustomCron && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-background group">
              <Clock size={14} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                value={cronInput}
                onChange={(e) => setCronInput(e.target.value)}
                onBlur={async () => {
                  const val = cronInput.trim();
                  if (!val || !isValidCron(val)) return;
                  try {
                    await addTrigger.mutateAsync({
                      automation_id: automationId,
                      type: "cron",
                      cron_expression: val,
                    });
                    toast.success("Starter added");
                    setShowCustomCron(false);
                    setCronInput("");
                  } catch {
                    toast.error("Failed to add starter");
                  }
                }}
                onKeyDown={async (e) => {
                  const val = cronInput.trim();
                  if (e.key === "Enter" && val && isValidCron(val)) {
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Escape") {
                    setShowCustomCron(false);
                    setCronInput("");
                  }
                }}
                placeholder="0 9 * * 1-5"
                className="flex-1 text-sm font-mono bg-transparent outline-none placeholder:text-muted-foreground/40"
                autoFocus
              />
              {cronInput && !isValidCron(cronInput) && (
                <span className="text-xs text-muted-foreground/60 shrink-0">
                  invalid
                </span>
              )}
              {addTrigger.isPending && (
                <Loading01
                  size={13}
                  className="animate-spin text-muted-foreground shrink-0"
                />
              )}
              <button
                type="button"
                className="shrink-0 p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
                onClick={() => {
                  setShowCustomCron(false);
                  setCronInput("");
                }}
              >
                <XClose size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Section: Agent — hidden when agent is fixed (embedded in project settings) */}
        {!fixedAgentId && (
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-muted-foreground/60">
              Agent
            </span>
            <AgentPicker
              selectedId={watchAgentId || null}
              onChange={(id) =>
                form.setValue("agent_id", id ?? "", { shouldDirty: true })
              }
            />
          </div>
        )}

        {/* Section: Instructions */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground/60">
              Instructions
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={!tiptapDoc}
              onClick={handleImprovePrompt}
            >
              <Stars01 size={13} />
              Improve
            </Button>
          </div>
          <TiptapProvider
            tiptapDoc={tiptapDoc}
            setTiptapDoc={setTiptapDoc}
            placeholder="What should this automation do?"
          >
            <div className="rounded-xl border border-border min-h-[120px] flex flex-col">
              <TiptapInput
                virtualMcpId={(fixedAgentId ?? watchAgentId) || null}
              />

              <div className="flex items-center justify-end gap-1.5 p-2.5">
                <ModelSelector
                  model={selectedModel}
                  isLoading={isModelsLoading}
                  credentialId={watchConnectionId || null}
                  onCredentialChange={(id) => {
                    form.setValue("credential_id", id ?? "", {
                      shouldDirty: true,
                    });
                    form.setValue("model_id", "", { shouldDirty: true });
                  }}
                  onModelChange={(model) =>
                    form.setValue("model_id", model.modelId, {
                      shouldDirty: true,
                    })
                  }
                  placeholder="Model"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="default"
                      className="h-8 gap-1.5 rounded-md px-3 text-sm font-medium"
                      onClick={handleRunClick}
                    >
                      <ArrowUp size={16} />
                      Test
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Test Automation</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TiptapProvider>
        </div>

        {/* Section: Run History */}
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-muted-foreground/60">
            Run History
          </span>
          <RunHistorySection
            automationId={automationId}
            triggerIds={automation.triggers.map((t) => t.id)}
          />
        </div>
      </div>
    </>
  );
}

import { RunHistorySection } from "@/web/components/automations/run-history-section.tsx";

// ============================================================================
// Main Component
// ============================================================================

export default function AutomationDetailPage() {
  const { automationId } = useParams({
    from: "/shell/$org/settings/automations/$automationId",
  });
  const navigate = useNavigate();
  const { org } = useProjectContext();

  const { data: automation, isLoading } = useAutomationDetail(automationId);
  const deleteMutation = useAutomationDelete();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(automationId);
      toast.success("Automation deleted");
      navigate({
        to: "/$org/settings/automations",
        params: { org: org.slug },
      });
    } catch {
      toast.error("Failed to delete automation");
    }
    setConfirmDelete(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading01 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!automation) {
    return (
      <EmptyState
        title="Automation not found"
        description="This automation may have been deleted."
      />
    );
  }

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/$org/settings/automations" params={{ org: org.slug }}>
              Automations
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{automation.name}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );

  return (
    <ViewLayout breadcrumb={breadcrumb}>
      <ViewActions>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash01 size={14} />
          Delete
        </Button>
      </ViewActions>

      <SettingsTab
        key={automationId}
        automationId={automationId}
        automation={automation}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{automation.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ViewLayout>
  );
}
