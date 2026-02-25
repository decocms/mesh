import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
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
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Cron } from "croner";

type TriggerType = "cron" | "event";
type ActionType = "tool_call" | "agent_prompt";

interface FormValues {
  title: string;
  triggerType: TriggerType;
  cronExpression: string;
  eventType: string;
  eventFilter: string;
  actionType: ActionType;
  connectionId: string;
  toolName: string;
  toolArguments: string;
  agentId: string;
  agentPrompt: string;
}

function PillToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="relative inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "relative z-10 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CronPreview({ expression }: { expression: string }) {
  if (!expression.trim()) return null;

  try {
    const cron = new Cron(expression);
    const next = cron.nextRun();
    if (!next) return null;

    return (
      <p className="text-xs text-muted-foreground mt-1">
        Next run:{" "}
        {next.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    );
  } catch {
    return (
      <p className="text-xs text-destructive mt-1">Invalid cron expression</p>
    );
  }
}

export function CreateTriggerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const form = useForm<FormValues>({
    defaultValues: {
      title: "",
      triggerType: "cron",
      cronExpression: "",
      eventType: "",
      eventFilter: "",
      actionType: "tool_call",
      connectionId: "",
      toolName: "",
      toolArguments: "",
      agentId: "",
      agentPrompt: "",
    },
  });

  const triggerType = form.watch("triggerType");
  const actionType = form.watch("actionType");
  const cronExpression = form.watch("cronExpression");

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const result = await client.callTool({
        name: "TRIGGER_CREATE",
        arguments: {
          title: values.title || null,
          triggerType: values.triggerType,
          cronExpression:
            values.triggerType === "cron" ? values.cronExpression : null,
          eventType: values.triggerType === "event" ? values.eventType : null,
          eventFilter:
            values.triggerType === "event" && values.eventFilter
              ? values.eventFilter
              : null,
          actionType: values.actionType,
          connectionId:
            values.actionType === "tool_call" ? values.connectionId : null,
          toolName: values.actionType === "tool_call" ? values.toolName : null,
          toolArguments:
            values.actionType === "tool_call" && values.toolArguments
              ? values.toolArguments
              : null,
          agentId: values.actionType === "agent_prompt" ? values.agentId : null,
          agentPrompt:
            values.actionType === "agent_prompt" ? values.agentPrompt : null,
        },
      });
      return result;
    },
    onSuccess: () => {
      toast.success("Trigger created");
      form.reset();
      onCreated();
    },
    onError: (err) => {
      toast.error(`Failed to create trigger: ${err.message}`);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    createMutation.mutate(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Trigger</DialogTitle>
          <DialogDescription>
            Create an automation — when something happens, do something.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {/* Name (optional) */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Name (optional)</Label>
            <Input
              id="title"
              placeholder="e.g., Daily email summary"
              {...form.register("title")}
            />
          </div>

          {/* When section */}
          <div className="flex flex-col gap-3">
            <Label className="text-base font-semibold">When</Label>
            <PillToggle
              value={triggerType}
              onChange={(v) => form.setValue("triggerType", v)}
              options={[
                { value: "cron", label: "Schedule" },
                { value: "event", label: "Event" },
              ]}
            />

            {triggerType === "cron" && (
              <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
                <Label htmlFor="cronExpression">Cron expression</Label>
                <Input
                  id="cronExpression"
                  placeholder="0 9 * * 1-5"
                  {...form.register("cronExpression")}
                />
                <CronPreview expression={cronExpression} />
              </div>
            )}

            {triggerType === "event" && (
              <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="eventType">Event type</Label>
                  <Input
                    id="eventType"
                    placeholder="e.g., order.created"
                    {...form.register("eventType")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="eventFilter">Filter (optional)</Label>
                  <Input
                    id="eventFilter"
                    placeholder="JSONPath filter on event data"
                    {...form.register("eventFilter")}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Then section */}
          <div className="flex flex-col gap-3">
            <Label className="text-base font-semibold">Then</Label>
            <PillToggle
              value={actionType}
              onChange={(v) => form.setValue("actionType", v)}
              options={[
                { value: "tool_call", label: "Call a Tool" },
                { value: "agent_prompt", label: "Run an Agent" },
              ]}
            />

            {actionType === "tool_call" && (
              <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="connectionId">Connection ID</Label>
                  <Input
                    id="connectionId"
                    placeholder="Connection ID"
                    {...form.register("connectionId")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="toolName">Tool name</Label>
                  <Input
                    id="toolName"
                    placeholder="e.g., SEND_SLACK_MESSAGE"
                    {...form.register("toolName")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="toolArguments">
                    Arguments (optional JSON)
                  </Label>
                  <Textarea
                    id="toolArguments"
                    placeholder='{"channel": "#general", "message": "Hello"}'
                    rows={3}
                    {...form.register("toolArguments")}
                  />
                </div>
              </div>
            )}

            {actionType === "agent_prompt" && (
              <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-1 duration-150">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="agentId">Agent (Virtual MCP) ID</Label>
                  <Input
                    id="agentId"
                    placeholder="Virtual MCP ID"
                    {...form.register("agentId")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="agentPrompt">Prompt</Label>
                  <Textarea
                    id="agentPrompt"
                    placeholder="Check the latest emails and summarize for the team"
                    rows={3}
                    {...form.register("agentPrompt")}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Trigger"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
