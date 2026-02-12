import { useEffect, useState } from "react";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { useRegistryConfig } from "../hooks/use-registry";
import { useRegistryTestConfig } from "../hooks/use-test-runs";
import type {
  RegistryTestConfig,
  TestFailureAction,
  TestMode,
} from "../lib/types";
import { PLUGIN_ID } from "../../shared";

function hasChanges(a: RegistryTestConfig, b: RegistryTestConfig): boolean {
  return (
    a.testMode !== b.testMode ||
    a.onFailure !== b.onFailure ||
    a.perMcpTimeoutMs !== b.perMcpTimeoutMs ||
    a.perToolTimeoutMs !== b.perToolTimeoutMs ||
    a.agentPrompt !== b.agentPrompt ||
    a.testPublicOnly !== b.testPublicOnly ||
    a.testPrivateOnly !== b.testPrivateOnly
  );
}

export function TestConfiguration({
  hideTestMode = false,
  borderless = false,
}: {
  hideTestMode?: boolean;
  borderless?: boolean;
}) {
  const { registryLLMConnectionId, registryLLMModelId } =
    useRegistryConfig(PLUGIN_ID);
  const { settings, saveMutation } = useRegistryTestConfig();
  const [draft, setDraft] = useState<RegistryTestConfig>(settings);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const isDirty = hasChanges(draft, settings);

  const setPartial = (patch: Partial<RegistryTestConfig>) => {
    setJustSaved(false);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const save = async () => {
    await saveMutation.mutateAsync(draft);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 3000);
  };

  return (
    <Card
      className={`p-4 space-y-4 ${borderless ? "border-0 shadow-none" : "border-dashed"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Test Configuration</h3>
          <p className="text-xs text-muted-foreground">
            Configure how the MCP test agent validates registry entries.
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
            disabled={saveMutation.isPending || !isDirty}
          >
            {saveMutation.isPending ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {!hideTestMode && (
          <div className="space-y-1">
            <Label>Test mode</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={draft.testMode}
              onChange={(e) =>
                setPartial({ testMode: e.target.value as TestMode })
              }
            >
              <option value="health_check">Health check</option>
              <option value="tool_call">Tool call</option>
              <option value="full_agent">Full agent (LLM-assisted)</option>
            </select>
          </div>
        )}

        <div className="space-y-1">
          <Label>On failure</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={draft.onFailure}
            onChange={(e) =>
              setPartial({ onFailure: e.target.value as TestFailureAction })
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
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Agent prompt</Label>
          <Badge variant="secondary" className="text-[10px]">
            Optional
          </Badge>
        </div>
        <Textarea
          rows={5}
          value={draft.agentPrompt ?? ""}
          onChange={(e) => setPartial({ agentPrompt: e.target.value })}
          className="max-h-52 overflow-y-auto resize-none"
          placeholder="Extra instructions for the test agent."
        />
      </div>

      <div className="text-xs text-muted-foreground">
        LLM defaults from Settings:{" "}
        <span className="font-mono">
          {registryLLMConnectionId || "-"} / {registryLLMModelId || "-"}
        </span>
      </div>
    </Card>
  );
}
