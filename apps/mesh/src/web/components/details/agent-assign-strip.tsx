import {
  useGatewayActions,
  useGateways,
} from "@/web/hooks/collections/use-gateway";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { useMemo, useState } from "react";

type EntityKind = "tool" | "resource" | "prompt";

export function AgentAssignStrip({
  entityId,
  entityKind,
}: {
  entityId: string;
  entityKind: EntityKind;
}) {
  const gateways = useGateways();
  const gatewayActions = useGatewayActions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(
    null,
  );

  const gatewaysContaining = useMemo(() => {
    return gateways.filter((gateway) => {
      if (entityKind === "tool") {
        return gateway.saved_tools?.includes(entityId);
      }
      if (entityKind === "resource") {
        return gateway.saved_resources?.includes(entityId);
      }
      return gateway.saved_prompts?.includes(entityId);
    });
  }, [gateways, entityId, entityKind]);

  const handleAdd = async () => {
    if (!selectedGatewayId) return;
    const gateway = gateways.find((g) => g.id === selectedGatewayId);
    if (!gateway) return;

    const nextSavedTools = new Set(gateway.saved_tools ?? []);
    const nextSavedResources = new Set(gateway.saved_resources ?? []);
    const nextSavedPrompts = new Set(gateway.saved_prompts ?? []);

    if (entityKind === "tool") nextSavedTools.add(entityId);
    if (entityKind === "resource") nextSavedResources.add(entityId);
    if (entityKind === "prompt") nextSavedPrompts.add(entityId);

    await gatewayActions.update.mutateAsync({
      id: gateway.id,
      data: {
        saved_tools: Array.from(nextSavedTools),
        saved_resources: Array.from(nextSavedResources),
        saved_prompts: Array.from(nextSavedPrompts),
      },
    });

    setDialogOpen(false);
    setSelectedGatewayId(null);
  };

  return (
    <div className="w-60 border-l border-border bg-muted/10 px-3 py-4 flex flex-col gap-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Agents
      </div>
      <div className="flex flex-col gap-2">
        {gatewaysContaining.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Not assigned to any agent.
          </div>
        ) : (
          gatewaysContaining.map((gateway) => (
            <div
              key={gateway.id}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {gateway.title}
            </div>
          ))
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => setDialogOpen(true)}
      >
        +
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add to agent</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Select
              value={selectedGatewayId ?? ""}
              onValueChange={(value) =>
                setSelectedGatewayId(value === "" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {gateways.map((gateway) => (
                  <SelectItem key={gateway.id} value={gateway.id}>
                    {gateway.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!selectedGatewayId || gatewayActions.update.isPending}
              >
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
