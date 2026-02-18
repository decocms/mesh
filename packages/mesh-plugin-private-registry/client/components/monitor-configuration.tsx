import { useRef, useState } from "react";
import {
  useCollectionList,
  useConnections,
  useMCPClientOptional,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { LLMModelSelector } from "@deco/ui/components/llm-model-selector.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { useRegistryConfig } from "../hooks/use-registry";
import {
  useMonitorScheduleCancel,
  useMonitorScheduleSet,
  useRegistryMonitorConfig,
} from "../hooks/use-monitor";
import type {
  RegistryMonitorConfig,
  MonitorFailureAction,
  MonitorMode,
} from "../lib/types";
import { PLUGIN_ID } from "../../shared";
import { cn } from "@deco/ui/lib/utils.ts";

function hasChanges(
  a: RegistryMonitorConfig,
  b: RegistryMonitorConfig,
): boolean {
  return (
    a.monitorMode !== b.monitorMode ||
    a.onFailure !== b.onFailure ||
    a.llmConnectionId !== b.llmConnectionId ||
    a.llmModelId !== b.llmModelId ||
    a.perMcpTimeoutMs !== b.perMcpTimeoutMs ||
    a.perToolTimeoutMs !== b.perToolTimeoutMs ||
    a.maxAgentSteps !== b.maxAgentSteps ||
    a.testPublicOnly !== b.testPublicOnly ||
    a.testPrivateOnly !== b.testPrivateOnly ||
    (a.agentContext ?? "") !== (b.agentContext ?? "") ||
    a.schedule !== b.schedule ||
    a.cronExpression !== b.cronExpression
  );
}

export function MonitorConfiguration({
  hideMonitorMode = false,
  borderless = false,
}: {
  hideMonitorMode?: boolean;
  borderless?: boolean;
}) {
  const { registryLLMConnectionId, registryLLMModelId } =
    useRegistryConfig(PLUGIN_ID);
  const { settings, saveMutation } = useRegistryMonitorConfig();
  const scheduleSetMutation = useMonitorScheduleSet();
  const scheduleCancelMutation = useMonitorScheduleCancel();
  const prevSettingsRef = useRef(settings);
  const [draft, setDraft] = useState<RegistryMonitorConfig>(settings);
  const [justSaved, setJustSaved] = useState(false);
  const { org } = useProjectContext();
  const allConnections = useConnections();
  const llmConnections = (allConnections ?? []).filter((connection) =>
    (connection.tools ?? []).some((tool) => tool.name === "LLM_DO_GENERATE"),
  );
  const effectiveLLMConnectionId =
    draft.llmConnectionId ||
    registryLLMConnectionId ||
    llmConnections[0]?.id ||
    "";
  const llmClient = useMCPClientOptional({
    connectionId: effectiveLLMConnectionId || undefined,
    orgId: org.id,
  });
  const llmModels = useCollectionList<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    description?: string | null;
    logo?: string | null;
    capabilities?: string[];
  }>(effectiveLLMConnectionId || "no-llm-connection", "LLM", llmClient);

  // Sync draft when external settings change (replaces useEffect)
  if (prevSettingsRef.current !== settings) {
    prevSettingsRef.current = settings;
    setDraft(settings);
  }

  const isDirty = hasChanges(draft, settings);

  const setPartial = (patch: Partial<RegistryMonitorConfig>) => {
    setJustSaved(false);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const save = async () => {
    const normalizedCron = draft.cronExpression?.trim() ?? "";
    let scheduleEventId = settings.scheduleEventId ?? "";

    if (draft.schedule === "cron" && normalizedCron.length > 0) {
      const cronChanged = normalizedCron !== (settings.cronExpression ?? "");
      if (cronChanged && scheduleEventId) {
        await scheduleCancelMutation.mutateAsync(scheduleEventId);
      }
      if (cronChanged || !scheduleEventId) {
        const scheduleResult = await scheduleSetMutation.mutateAsync({
          cronExpression: normalizedCron,
          config: draft,
        });
        scheduleEventId = scheduleResult.scheduleEventId;
      }
    } else if (scheduleEventId) {
      await scheduleCancelMutation.mutateAsync(scheduleEventId);
      scheduleEventId = "";
    }

    const normalizedModelId = (draft.llmModelId ?? "").trim();
    const normalizedConnectionId = normalizedModelId
      ? (draft.llmConnectionId || effectiveLLMConnectionId || "").trim()
      : (draft.llmConnectionId ?? "").trim();

    const nextDraft: RegistryMonitorConfig = {
      ...draft,
      cronExpression: normalizedCron,
      scheduleEventId,
      agentContext: (draft.agentContext ?? "").trim(),
      llmConnectionId: normalizedConnectionId,
      llmModelId: normalizedModelId,
    };
    await saveMutation.mutateAsync(nextDraft);
    setDraft(nextDraft);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 3000);
  };

  return (
    <Card
      className={cn(
        "p-4 space-y-4",
        borderless ? "border-0 shadow-none" : "border-dashed",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Monitor Configuration</h3>
          <p className="text-xs text-muted-foreground">
            Configure how the MCP monitor agent validates registry entries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
              Unsaved changes
            </Badge>
          )}
          {justSaved && (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
              ✓ Saved
            </Badge>
          )}
          <Button
            size="sm"
            onClick={save}
            disabled={
              saveMutation.isPending ||
              scheduleSetMutation.isPending ||
              scheduleCancelMutation.isPending ||
              !isDirty
            }
          >
            {saveMutation.isPending ||
            scheduleSetMutation.isPending ||
            scheduleCancelMutation.isPending
              ? "Saving..."
              : "Save settings"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {!hideMonitorMode && (
          <div className="space-y-1">
            <Label>Monitor mode</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={draft.monitorMode}
              onChange={(e) =>
                setPartial({ monitorMode: e.target.value as MonitorMode })
              }
            >
              <option value="health_check">Health check</option>
              <option value="tool_call">Tool call</option>
              <option value="full_agent">Agentic (modelo LLM)</option>
            </select>
          </div>
        )}

        <div className="space-y-1">
          <Label>On failure</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={draft.onFailure}
            onChange={(e) =>
              setPartial({ onFailure: e.target.value as MonitorFailureAction })
            }
          >
            <option value="none">Do nothing</option>
            <option value="unlisted">
              Unlist from store (keep in registry)
            </option>
            <option value="remove_public">Remove from public store</option>
            <option value="remove_private">Remove from private registry</option>
            <option value="remove_all">
              Remove from all (public + private)
            </option>
          </select>
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label>Modelo (LLM binding)</Label>
          <LLMModelSelector
            connectionId={effectiveLLMConnectionId}
            modelId={draft.llmModelId ?? ""}
            connections={llmConnections.map((connection) => ({
              id: connection.id,
              title: connection.title,
              icon: connection.icon ?? null,
            }))}
            models={llmModels.map((model) => ({
              id: model.id,
              title: model.title || model.id,
              logo: model.logo ?? null,
              capabilities: model.capabilities ?? [],
            }))}
            onConnectionChange={(value) =>
              setPartial({
                llmConnectionId: value,
                llmModelId: "",
              })
            }
            onModelChange={(value) => setPartial({ llmModelId: value })}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label>Contexto extra para testes (prompt)</Label>
          <Textarea
            value={draft.agentContext ?? ""}
            onChange={(e) => setPartial({ agentContext: e.target.value })}
            placeholder='Ex: Use o email "meu-usuario@empresa.com" para testar share_file/create_permission no Google Drive.'
            rows={3}
          />
          <p className="text-[11px] text-muted-foreground">
            Use este campo para dados reais exigidos por algumas tools (email
            válido, IDs fixos, ambiente de teste etc).
          </p>
        </div>

        <div className="space-y-1">
          <Label>Schedule</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={draft.schedule ?? "manual"}
            onChange={(e) =>
              setPartial({
                schedule: e.target.value as RegistryMonitorConfig["schedule"],
              })
            }
          >
            <option value="manual">Manual only</option>
            <option value="cron">Cron schedule</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label>Cron expression</Label>
          <Input
            value={draft.cronExpression ?? ""}
            disabled={(draft.schedule ?? "manual") !== "cron"}
            onChange={(e) => setPartial({ cronExpression: e.target.value })}
            placeholder="*/15 * * * *"
          />
        </div>

        <div className="space-y-1">
          <Label>Per MCP timeout (ms)</Label>
          <Input
            type="number"
            value={draft.perMcpTimeoutMs}
            onChange={(e) =>
              setPartial({ perMcpTimeoutMs: Number(e.target.value) })
            }
          />
        </div>

        <div className="space-y-1">
          <Label>Per tool timeout (ms)</Label>
          <Input
            type="number"
            value={draft.perToolTimeoutMs}
            onChange={(e) =>
              setPartial({ perToolTimeoutMs: Number(e.target.value) })
            }
          />
        </div>

        <div className="space-y-1">
          <Label>Max agent steps</Label>
          <Input
            type="number"
            value={draft.maxAgentSteps}
            onChange={(e) =>
              setPartial({ maxAgentSteps: Number(e.target.value) })
            }
            min={1}
            max={30}
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        LLM fallback from Settings:{" "}
        <span className="font-mono">
          {registryLLMConnectionId || "-"} / {registryLLMModelId || "-"}
        </span>
      </div>
    </Card>
  );
}
