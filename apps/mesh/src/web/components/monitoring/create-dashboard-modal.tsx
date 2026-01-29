/**
 * Create Dashboard Modal
 *
 * Modal for creating a new monitoring dashboard with widgets.
 */

import { KEYS } from "@/web/lib/query-keys";
import {
  useMCPClient,
  useProjectContext,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { useState } from "react";
import { Plus, Trash01 } from "@untitledui/icons";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ============================================================================
// Types
// ============================================================================

interface WidgetInput {
  id: string;
  name: string;
  type: "metric" | "timeseries" | "table";
  sourcePath: string;
  sourceFrom: "input" | "output";
  aggregationFn: "sum" | "avg" | "min" | "max" | "count" | "last";
  groupBy: string;
  interval: string;
}

const DEFAULT_WIDGET: WidgetInput = {
  id: crypto.randomUUID(),
  name: "",
  type: "metric",
  sourcePath: "$.usage.total_tokens",
  sourceFrom: "output",
  aggregationFn: "sum",
  groupBy: "",
  interval: "",
};

// ============================================================================
// Widget Editor
// ============================================================================

interface WidgetEditorProps {
  widget: WidgetInput;
  onChange: (widget: WidgetInput) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function WidgetEditor({
  widget,
  onChange,
  onRemove,
  canRemove,
}: WidgetEditorProps) {
  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Widget Configuration</h4>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRemove}
          >
            <Trash01 size={14} />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Widget Name
          </label>
          <Input
            placeholder="e.g., Total Tokens"
            value={widget.name}
            onChange={(e) => onChange({ ...widget, name: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Widget Type
          </label>
          <Select
            value={widget.type}
            onValueChange={(value) =>
              onChange({
                ...widget,
                type: value as WidgetInput["type"],
                // Reset type-specific fields
                groupBy: value === "table" ? widget.groupBy : "",
                interval: value === "timeseries" ? widget.interval || "1h" : "",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="metric">Metric (single value)</SelectItem>
              <SelectItem value="table">Table (grouped)</SelectItem>
              <SelectItem value="timeseries">Timeseries (over time)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            JSONPath
          </label>
          <Input
            placeholder="$.usage.total_tokens"
            value={widget.sourcePath}
            onChange={(e) =>
              onChange({ ...widget, sourcePath: e.target.value })
            }
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Path to extract from tool call data
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Extract From
          </label>
          <Select
            value={widget.sourceFrom}
            onValueChange={(value) =>
              onChange({ ...widget, sourceFrom: value as "input" | "output" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="output">Output</SelectItem>
              <SelectItem value="input">Input</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Aggregation Function
          </label>
          <Select
            value={widget.aggregationFn}
            onValueChange={(value) =>
              onChange({
                ...widget,
                aggregationFn: value as WidgetInput["aggregationFn"],
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sum">Sum</SelectItem>
              <SelectItem value="avg">Average</SelectItem>
              <SelectItem value="min">Minimum</SelectItem>
              <SelectItem value="max">Maximum</SelectItem>
              <SelectItem value="count">Count</SelectItem>
              <SelectItem value="last">Last</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {widget.type === "table" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Group By (JSONPath)
            </label>
            <Input
              placeholder="$.model"
              value={widget.groupBy}
              onChange={(e) => onChange({ ...widget, groupBy: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
        )}

        {widget.type === "timeseries" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Time Interval
            </label>
            <Select
              value={widget.interval || "1h"}
              onValueChange={(value) =>
                onChange({ ...widget, interval: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">15 minutes</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="1d">1 day</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface CreateDashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export function CreateDashboardModal({
  open,
  onOpenChange,
  onCreated,
}: CreateDashboardModalProps) {
  const { org, locator } = useProjectContext();
  const queryClient = useQueryClient();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [widgets, setWidgets] = useState<WidgetInput[]>([
    { ...DEFAULT_WIDGET },
  ]);
  const [isCreating, setIsCreating] = useState(false);

  const handleAddWidget = () => {
    setWidgets([...widgets, { ...DEFAULT_WIDGET, id: crypto.randomUUID() }]);
  };

  const handleRemoveWidget = (index: number) => {
    setWidgets(widgets.filter((_, i) => i !== index));
  };

  const handleWidgetChange = (index: number, widget: WidgetInput) => {
    const updated = [...widgets];
    updated[index] = widget;
    setWidgets(updated);
  };

  const handleCreate = async () => {
    if (!client) return;
    if (!name.trim()) {
      toast.error("Please enter a dashboard name");
      return;
    }
    if (widgets.some((w) => !w.name.trim())) {
      toast.error("Please enter a name for all widgets");
      return;
    }

    setIsCreating(true);
    try {
      const result = (await client.callTool({
        name: "MONITORING_DASHBOARD_CREATE",
        arguments: {
          name: name.trim(),
          description: description.trim() || undefined,
          widgets: widgets.map((w) => ({
            id: w.id,
            name: w.name.trim(),
            type: w.type,
            source: {
              path: w.sourcePath,
              from: w.sourceFrom,
            },
            aggregation: {
              fn: w.aggregationFn,
              groupBy: w.type === "table" && w.groupBy ? w.groupBy : undefined,
              interval:
                w.type === "timeseries" && w.interval ? w.interval : undefined,
            },
          })),
        },
      })) as { structuredContent?: { id: string } };

      const dashboardId = (
        result.structuredContent ?? (result as unknown as { id: string })
      ).id;

      toast.success("Dashboard created");
      queryClient.invalidateQueries({
        queryKey: KEYS.monitoringDashboards(locator),
      });

      // Reset form
      setName("");
      setDescription("");
      setWidgets([{ ...DEFAULT_WIDGET, id: crypto.randomUUID() }]);

      onCreated(dashboardId);
    } catch (error) {
      toast.error("Failed to create dashboard");
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Dashboard</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Dashboard Info */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Dashboard Name
              </label>
              <Input
                placeholder="e.g., LLM Usage Overview"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Description (optional)
              </label>
              <Textarea
                placeholder="Describe what this dashboard shows..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Widgets */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Widgets</h3>
              <Button variant="outline" size="sm" onClick={handleAddWidget}>
                <Plus size={14} className="mr-1.5" />
                Add Widget
              </Button>
            </div>
            <div className="space-y-4">
              {widgets.map((widget, index) => (
                <WidgetEditor
                  key={widget.id}
                  widget={widget}
                  onChange={(w) => handleWidgetChange(index, w)}
                  onRemove={() => handleRemoveWidget(index)}
                  canRemove={widgets.length > 1}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Dashboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
