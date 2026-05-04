/**
 * Automation Detail Page
 *
 * Settings and run history for a single automation on one page.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import {
  useAiProviderModels,
  type AiProviderModel,
} from "@/web/hooks/collections/use-ai-providers.ts";
import { ModelSelector } from "@/web/components/chat/select-model.tsx";
import { User } from "@/web/components/user/user.tsx";
import {
  useAutomation,
  useAutomationActions,
  useTriggerList,
  type TriggerDefinition,
} from "@/web/hooks/use-automations";
import { useChatTask, useChatPrefs } from "@/web/components/chat/context";
import { usePreferences } from "@/web/hooks/use-preferences";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  getDecopilotId,
  useConnections,
  useProjectContext,
} from "@decocms/mesh-sdk";
import {
  ArrowLeft,
  ArrowUp,
  Clock,
  Loading01,
  Stars01,
  Trash01,
  XClose,
  Zap,
} from "@untitledui/icons";
import { Suspense, useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import type { Metadata } from "@/web/components/chat/types.ts";
import {
  TiptapProvider,
  TiptapInput,
} from "@/web/components/chat/tiptap/input.tsx";
import {
  derivePartsFromTiptapDoc,
  tiptapDocToMessages,
} from "@/web/components/chat/derive-parts.ts";

// ============================================================================
// Types
// ============================================================================

interface SettingsFormData {
  name: string;
  active: boolean;
  credential_id: string;
  model_id: string;
}

// ============================================================================
// Helpers (shared)
// ============================================================================

import { isValidCron } from "@/web/lib/cron-utils.ts";
import { AddStarterPopover } from "@/web/components/automations/add-starter-popover.tsx";
import { TriggerCard } from "@/web/components/automations/trigger-card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { track } from "@/web/lib/posthog-client";

// ============================================================================
// Event Trigger Form
// ============================================================================

function EventTriggerForm({
  automationId,
  onDone,
}: {
  automationId: string;
  onDone: () => void;
}) {
  const triggerConnections = useConnections({ binding: "TRIGGER" });
  const [connectionId, setConnectionId] = useState<string | undefined>();
  const [eventType, setEventType] = useState<string | undefined>();
  const [params, setParams] = useState<Record<string, string>>({});
  const { triggerAdd: addTrigger } = useAutomationActions();
  const { data: triggerDefs, isLoading: isLoadingTriggers } =
    useTriggerList(connectionId);

  const selectedTrigger = triggerDefs?.find(
    (t: TriggerDefinition) => t.type === eventType,
  );

  const handleSubmit = async () => {
    if (!connectionId || !eventType) return;
    try {
      await addTrigger.mutateAsync({
        automation_id: automationId,
        type: "event",
        event_type: eventType,
        connection_id: connectionId,
        params,
      });
      track("automation_trigger_added", {
        automation_id: automationId,
        trigger_type: "event",
        connection_id: connectionId,
        event_type: eventType,
      });
      toast.success("Event trigger added");
      onDone();
    } catch {
      toast.error("Failed to add event trigger");
    }
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3 rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Event trigger</span>
        <button
          type="button"
          className="ml-auto shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground"
          onClick={onDone}
        >
          <XClose size={13} />
        </button>
      </div>

      {/* Step 1: Connection */}
      <Select
        value={connectionId ?? ""}
        onValueChange={(val) => {
          setConnectionId(val);
          setEventType(undefined);
          setParams({});
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select connection..." />
        </SelectTrigger>
        <SelectContent>
          {triggerConnections.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No connections with trigger support
            </div>
          ) : (
            triggerConnections.map((conn) => (
              <SelectItem key={conn.id} value={conn.id}>
                {conn.title}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Step 2: Event type */}
      {connectionId && (
        <Select
          value={eventType ?? ""}
          onValueChange={(val) => {
            setEventType(val);
            setParams({});
          }}
        >
          <SelectTrigger className="w-full">
            {isLoadingTriggers ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loading01 size={13} className="animate-spin" />
                Loading events...
              </span>
            ) : (
              <SelectValue placeholder="Select event type...">
                {eventType ?? "Select event type..."}
              </SelectValue>
            )}
          </SelectTrigger>
          <SelectContent>
            {triggerDefs?.map((t: TriggerDefinition) => (
              <SelectItem key={t.type} value={t.type}>
                <div className="flex flex-col">
                  <span>{t.type}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Step 3: Params */}
      {selectedTrigger?.paramsSchema &&
        Object.keys(selectedTrigger.paramsSchema).length > 0 && (
          <div className="flex flex-col gap-2">
            {Object.entries(selectedTrigger.paramsSchema).map(
              ([key, schema]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    {key}
                    {schema.description && (
                      <span className="text-muted-foreground/60">
                        {" "}
                        — {schema.description}
                      </span>
                    )}
                  </label>
                  {schema.enum ? (
                    <Select
                      value={params[key] ?? ""}
                      onValueChange={(val) =>
                        setParams((p) => ({ ...p, [key]: val }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={`Select ${key}...`} />
                      </SelectTrigger>
                      <SelectContent>
                        {schema.enum.map((val) => (
                          <SelectItem key={val} value={val}>
                            {val}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <input
                      type="text"
                      value={params[key] ?? ""}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, [key]: e.target.value }))
                      }
                      placeholder={schema.description ?? key}
                      className="text-sm border border-border rounded-md bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  )}
                </div>
              ),
            )}
          </div>
        )}

      {/* Submit */}
      {connectionId && eventType && (
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={addTrigger.isPending}
        >
          {addTrigger.isPending ? (
            <Loading01 size={13} className="animate-spin" />
          ) : (
            "Add trigger"
          )}
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Settings Tab
// ============================================================================

export function SettingsTab({
  automationId,
  automation,
  virtualMcpId,
  onBack,
  onDelete,
}: {
  automationId: string;
  automation: NonNullable<ReturnType<typeof useAutomation>["data"]>;
  virtualMcpId: string;
  onBack?: () => void;
  onDelete?: () => void;
}) {
  const agentId = automation.agent?.id ?? virtualMcpId;
  const { org } = useProjectContext();
  const { update: updateMutation, triggerAdd: addTrigger } =
    useAutomationActions();
  const allConnections = useConnections();
  const connectionNameMap = new Map(allConnections.map((c) => [c.id, c.title]));

  // Chat hooks for running the automation
  const { createTaskWithMessage } = useChatTask();
  const {
    setModel,
    credentialId: chatCredentialId,
    selectedModel: chatModel,
    setChatMode,
  } = useChatPrefs();
  const [preferences, setPreferences] = usePreferences();
  const initialTiptapDoc =
    (automation.messages?.[0] as { metadata?: Metadata } | undefined)?.metadata
      ?.tiptapDoc ?? undefined;
  const [tiptapDoc, setTiptapDocRaw] =
    useState<Metadata["tiptapDoc"]>(initialTiptapDoc);
  const [starterOpen, setStarterOpen] = useState(false);
  const [showCustomCron, setShowCustomCron] = useState(false);
  const [cronInput, setCronInput] = useState("");
  const [showEventForm, setShowEventForm] = useState(false);
  const editorInitializedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiptapDirtyRef = useRef(false);
  // The save runs from a debounced setTimeout. Reading state through a closure
  // there would give us the value from the render that scheduled the timer,
  // not the latest keystroke — that's how trailing characters got lost.
  const tiptapDocRef = useRef<Metadata["tiptapDoc"]>(initialTiptapDoc);

  const handleImprovePrompt = () => {
    const parts = derivePartsFromTiptapDoc(tiptapDoc);
    const instructionsText = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (!instructionsText.trim()) return;

    flushEditSession();
    track("automation_improve_clicked", {
      automation_id: automationId,
      agent_id: agentId,
      instructions_length: instructionsText.length,
    });

    setChatMode("plan");

    createTaskWithMessage({
      virtualMcpId: getDecopilotId(org.id),
      message: {
        parts: [
          {
            type: "text",
            text: `/writing-prompts for automation with id ${automationId}. The current message is\n\n<message>\n${instructionsText}\n</message>`,
          },
        ],
      },
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
      credential_id: defaultCredentialId,
      model_id: defaultModelId,
    },
  });

  const watchActive = form.watch("active");
  const watchConnectionId = form.watch("credential_id");
  const watchModelId = form.watch("model_id");

  const { models, isLoading: isModelsLoading } = useAiProviderModels(
    watchConnectionId || undefined,
  );
  const selectedModel: AiProviderModel | null =
    models.find((m) => m.modelId === watchModelId) ?? null;

  // Session-based tracking for automation_updated. Auto-saves persist every
  // ~1s but we only emit one PostHog event per edit-session (aggregated
  // fields + save_count + edit_duration_ms). A session ends after 30s of
  // quiet, or on explicit flush (tab-leave, improve, test).
  const editSessionStartRef = useRef<number | null>(null);
  const editSessionFieldsRef = useRef<Set<string>>(new Set());
  const editSessionSaveCountRef = useRef(0);
  const editSessionFlushRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const EDIT_SESSION_QUIET_MS = 30_000;

  const flushEditSession = () => {
    if (editSessionFlushRef.current) {
      clearTimeout(editSessionFlushRef.current);
      editSessionFlushRef.current = null;
    }
    if (editSessionStartRef.current === null) return;
    track("automation_updated", {
      automation_id: automationId,
      agent_id: agentId,
      fields: Array.from(editSessionFieldsRef.current),
      save_count: editSessionSaveCountRef.current,
      edit_duration_ms: Date.now() - editSessionStartRef.current,
    });
    editSessionStartRef.current = null;
    editSessionFieldsRef.current = new Set();
    editSessionSaveCountRef.current = 0;
  };

  const saveForm = async (): Promise<boolean> => {
    const hasDirtyFields = Object.keys(form.formState.dirtyFields).length > 0;
    if (!hasDirtyFields && !tiptapDirtyRef.current) return true;
    const dirtyFormKeys = Object.keys(form.formState.dirtyFields);
    const tiptapWasDirty = tiptapDirtyRef.current;
    tiptapDirtyRef.current = false;

    const values = form.getValues();
    const tiptapDocAtSave = tiptapDocRef.current;
    try {
      const coercedCredentialId =
        values.credential_id && values.model_id ? values.credential_id : "";
      const coercedModelId =
        values.credential_id && values.model_id ? values.model_id : "";

      const updatePayload = {
        id: automationId,
        name: values.name,
        active: values.active,
        agent: {
          id: agentId,
        },
        models: {
          credentialId: coercedCredentialId,
          thinking: {
            id: coercedModelId,
          },
        },
        messages: tiptapDocToMessages(tiptapDocAtSave),
        temperature: 0,
      };
      await updateMutation.mutateAsync(updatePayload);

      // Accumulate into the edit session.
      if (editSessionStartRef.current === null) {
        editSessionStartRef.current = Date.now();
      }
      for (const k of dirtyFormKeys) editSessionFieldsRef.current.add(k);
      if (tiptapWasDirty) editSessionFieldsRef.current.add("messages");
      editSessionSaveCountRef.current += 1;
      if (editSessionFlushRef.current) {
        clearTimeout(editSessionFlushRef.current);
      }
      editSessionFlushRef.current = setTimeout(
        flushEditSession,
        EDIT_SESSION_QUIET_MS,
      );

      // keepDirtyValues: any field the user kept editing during the in-flight
      // mutation stays at its current value AND keeps its dirty flag, so the
      // queued debouncedSave actually persists those edits on its next fire.
      // Without this, reset would clear dirty state and the next saveForm
      // would early-return on hasDirtyFields=false, stranding the keystrokes
      // in the UI but never sending them to the server.
      form.reset(
        {
          ...values,
          credential_id: coercedCredentialId,
          model_id: coercedModelId,
        },
        { keepDirtyValues: true },
      );
      return true;
    } catch {
      tiptapDirtyRef.current = true;
      return false;
    }
  };

  // Always-fresh ref to saveForm so debounced timers and the form-watch
  // subscription (which is registered once) call the latest closure that reads
  // current state, not whichever closure happened to be in scope at scheduling
  // time.
  const saveFormRef = useRef(saveForm);
  saveFormRef.current = saveForm;

  const debouncedSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveFormRef.current();
    }, 1000);
  };

  const flushAndSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return saveFormRef.current();
  };

  const setTiptapDoc = (doc: Metadata["tiptapDoc"]) => {
    tiptapDocRef.current = doc;
    setTiptapDocRaw(doc);
    if (!editorInitializedRef.current) {
      editorInitializedRef.current = true;
      return;
    }
    tiptapDirtyRef.current = true;
    debouncedSave();
  };

  const watchSubscribedRef = useRef(false);
  if (!watchSubscribedRef.current) {
    watchSubscribedRef.current = true;
    form.watch(() => {
      debouncedSave();
    });
  }

  // Flush any pending save on unmount so navigating away within the 1s
  // debounce window doesn't drop the last edit.
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        saveFormRef.current();
      }
    };
  }, []);

  const handleRunClick = async () => {
    track("automation_test_clicked", {
      automation_id: automationId,
      agent_id: agentId,
    });
    const saved = await flushAndSave();
    flushEditSession();
    if (!saved) return;

    if (!tiptapDoc) {
      toast.error("No instructions configured for this automation");
      return;
    }

    if (selectedModel && watchConnectionId) {
      setModel({ ...selectedModel, keyId: watchConnectionId });
    }

    setPreferences({ ...preferences, toolApprovalLevel: "auto" });

    const parts = derivePartsFromTiptapDoc(tiptapDoc);
    createTaskWithMessage({
      message: { tiptapDoc, parts },
      virtualMcpId: agentId || undefined,
    });
  };

  return (
    <>
      {onBack && (
        <div className="flex items-center pb-4 shrink-0">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={14} />
            Back to list
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {/* Header: Name + Status + Creator */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-4">
            <Input
              {...form.register("name")}
              placeholder="Automation name"
              className="border border-transparent shadow-none px-0 text-lg font-medium h-auto focus-visible:ring-0 focus-visible:border-border bg-transparent flex-1"
              style={{ boxShadow: "none" }}
            />
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={onDelete}
              >
                <Trash01 size={14} />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    setTimeout(() => flushAndSave(), 0);
                  }}
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
            <h2 className="text-sm font-medium text-foreground">
              Starter
            </h2>
            <AddStarterPopover
              automationId={automationId}
              open={starterOpen}
              onOpenChange={setStarterOpen}
              onCustomSelect={() => {
                setShowCustomCron(true);
                setShowEventForm(false);
                setCronInput("");
              }}
              onEventSelect={() => {
                setShowEventForm(true);
                setShowCustomCron(false);
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
                  connectionName={
                    trigger.connection_id
                      ? connectionNameMap.get(trigger.connection_id)
                      : undefined
                  }
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
                    track("automation_trigger_added", {
                      automation_id: automationId,
                      trigger_type: "cron",
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

          {showEventForm && (
            <Suspense
              fallback={
                <div className="flex items-center gap-2 px-3 py-3 rounded-lg border border-border bg-background">
                  <Loading01
                    size={13}
                    className="animate-spin text-muted-foreground"
                  />
                  <span className="text-sm text-muted-foreground">
                    Loading connections...
                  </span>
                </div>
              }
            >
              <EventTriggerForm
                automationId={automationId}
                onDone={() => setShowEventForm(false)}
              />
            </Suspense>
          )}
        </div>

        {/* Section: Instructions */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">
              Instructions
            </h2>
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
            enableHeadings
          >
            <div className="rounded-xl border border-border min-h-[120px] flex flex-col">
              <TiptapInput
                virtualMcpId={agentId || null}
                className={cn(
                  "max-h-[45vh]",
                  "[&_.ProseMirror_h1]:text-[1.25em] [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:leading-snug [&_.ProseMirror_h1]:mt-4 [&_.ProseMirror_h1]:mb-1",
                  "[&_.ProseMirror_h2]:text-[1.1em] [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:leading-snug [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-0.5",
                  "[&_.ProseMirror_h3]:text-[1em] [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:leading-snug [&_.ProseMirror_h3]:mt-2",
                  "[&_.ProseMirror_>*:first-child]:mt-0",
                  "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:my-1",
                  "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:my-1",
                  "[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-muted-foreground/30 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground",
                  "[&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:rounded-sm [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:text-[0.85em] [&_.ProseMirror_code]:font-mono",
                  "[&_.ProseMirror_pre]:bg-muted [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto",
                  "[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_pre_code]:text-sm",
                  "[&_.ProseMirror_hr]:border-border [&_.ProseMirror_hr]:my-3",
                  "[&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:my-2 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:text-sm",
                  "[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:bg-muted [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:text-left",
                  "[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1",
                )}
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
                      disabled={!agentId}
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
      </div>
    </>
  );
}
