import { Page } from "@/web/components/page";
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
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
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
import { ErrorBoundary } from "@/web/components/error-boundary";
import { KEYS } from "@/web/lib/query-keys";
import {
  SELF_MCP_ALIAS_ID,
  ORG_ADMIN_PROJECT_SLUG,
  useProjectContext,
  useMCPClient,
} from "@decocms/mesh-sdk";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Loading01, Trash01 } from "@untitledui/icons";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Cron } from "croner";
import { formatTimeAgo } from "@/web/lib/format-time";

interface TriggerEntity {
  id: string;
  organizationId: string;
  title: string | null;
  enabled: boolean;
  triggerType: "cron" | "event";
  cronExpression: string | null;
  eventType: string | null;
  eventFilter: string | null;
  actionType: "tool_call" | "agent_prompt";
  connectionId: string | null;
  toolName: string | null;
  toolArguments: string | null;
  agentId: string | null;
  agentPrompt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

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

function TriggerDetailContent() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { triggerId } = useParams({ strict: false }) as {
    triggerId: string;
  };
  const [deleteOpen, setDeleteOpen] = useState(false);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data: trigger } = useSuspenseQuery({
    queryKey: KEYS.trigger(locator, triggerId),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "TRIGGER_GET",
        arguments: { id: triggerId },
      })) as { structuredContent?: TriggerEntity };
      return result.structuredContent as TriggerEntity;
    },
  });

  const form = useForm<FormValues>({
    defaultValues: {
      title: trigger.title ?? "",
      triggerType: trigger.triggerType,
      cronExpression: trigger.cronExpression ?? "",
      eventType: trigger.eventType ?? "",
      eventFilter: trigger.eventFilter ?? "",
      actionType: trigger.actionType,
      connectionId: trigger.connectionId ?? "",
      toolName: trigger.toolName ?? "",
      toolArguments: trigger.toolArguments ?? "",
      agentId: trigger.agentId ?? "",
      agentPrompt: trigger.agentPrompt ?? "",
    },
  });

  const triggerType = form.watch("triggerType");
  const actionType = form.watch("actionType");
  const cronExpression = form.watch("cronExpression");

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      await client.callTool({
        name: "TRIGGER_UPDATE",
        arguments: {
          id: triggerId,
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
    },
    onSuccess: () => {
      toast.success("Trigger updated");
      queryClient.invalidateQueries({
        queryKey: KEYS.trigger(locator, triggerId),
      });
      queryClient.invalidateQueries({ queryKey: KEYS.triggers(locator) });
    },
    onError: (err) => {
      toast.error(`Failed to update trigger: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await client.callTool({
        name: "TRIGGER_DELETE",
        arguments: { id: triggerId },
      });
    },
    onSuccess: () => {
      toast.success("Trigger deleted");
      queryClient.invalidateQueries({ queryKey: KEYS.triggers(locator) });
      navigate({
        to: "/$org/$project/triggers",
        params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
      });
    },
    onError: (err) => {
      toast.error(`Failed to delete trigger: ${err.message}`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await client.callTool({
        name: "TRIGGER_UPDATE",
        arguments: { id: triggerId, enabled },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.trigger(locator, triggerId),
      });
      queryClient.invalidateQueries({ queryKey: KEYS.triggers(locator) });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    updateMutation.mutate(values);
  });

  return (
    <Page>
      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trigger?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this
              trigger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link
                    to="/$org/$project/triggers"
                    params={{
                      org: org.slug,
                      project: ORG_ADMIN_PROJECT_SLUG,
                    }}
                  >
                    Triggers
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{trigger.title || "Untitled"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
        <Page.Header.Right>
          <div className="flex items-center gap-2">
            <Switch
              checked={trigger.enabled}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
              disabled={toggleMutation.isPending}
            />
            <span className="text-sm text-muted-foreground">
              {trigger.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash01 size={16} />
            Delete
          </Button>
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </Page.Header.Right>
      </Page.Header>

      {/* Content */}
      <Page.Content>
        <div className="flex-1 overflow-auto p-5">
          <div className="max-w-2xl flex flex-col gap-6">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Name</Label>
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
                <div className="flex flex-col gap-1.5">
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
                <div className="flex flex-col gap-3">
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
                <div className="flex flex-col gap-3">
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
                <div className="flex flex-col gap-3">
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

            {/* Recent Runs */}
            <div className="flex flex-col gap-2 pt-4 border-t">
              <Label className="text-base font-semibold">Recent Activity</Label>
              {trigger.lastRunAt ? (
                <div className="text-sm text-muted-foreground">
                  <p>
                    Last run: {formatTimeAgo(new Date(trigger.lastRunAt))}
                    {trigger.lastRunStatus === "success" && (
                      <span className="ml-1 text-green-500">Success</span>
                    )}
                    {trigger.lastRunStatus === "failed" && (
                      <span className="ml-1 text-destructive">Failed</span>
                    )}
                  </p>
                  {trigger.lastRunError && (
                    <p className="mt-1 text-destructive text-xs">
                      Error: {trigger.lastRunError}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This trigger has not run yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </Page.Content>
    </Page>
  );
}

export default function TriggerDetail() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <TriggerDetailContent />
      </Suspense>
    </ErrorBoundary>
  );
}
