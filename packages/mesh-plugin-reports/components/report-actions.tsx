/**
 * Report Actions Component
 *
 * Renders actionable items from a report with confirmation dialogs
 * and execution via REPORTS_EXECUTE_ACTION.
 */

import {
  REPORTS_BINDING,
  type ReportAction,
  type ReportsExecuteActionOutput,
} from "@decocms/bindings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@deco/ui/components/alert-dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  AlertCircle,
  CheckCircle,
  GitPullRequest,
  LinkExternal01,
  Loading01,
  Terminal,
  XCircle,
} from "@untitledui/icons";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { KEYS } from "../lib/query-keys";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<ReportAction["type"], typeof GitPullRequest> = {
  "create-pr": GitPullRequest,
  "create-issue": AlertCircle,
  "run-command": Terminal,
  link: LinkExternal01,
};

const ACTION_LABELS: Record<ReportAction["type"], string> = {
  "create-pr": "Create PR",
  "create-issue": "Create Issue",
  "run-command": "Run Command",
  link: "Open Link",
};

// ---------------------------------------------------------------------------
// Single Action Item
// ---------------------------------------------------------------------------

function ActionItem({
  action,
  reportId,
}: {
  action: ReportAction;
  reportId: string;
}) {
  const { connectionId, toolCaller } =
    usePluginContext<typeof REPORTS_BINDING>();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ReportsExecuteActionOutput | null>(null);

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await toolCaller("REPORTS_EXECUTE_ACTION", {
        reportId,
        actionId: action.id,
      });
      return res;
    },
    onSuccess: (res) => {
      setResult(res);
      if (res.success) {
        toast.success(res.message || "Action completed successfully");
        if (res.url) {
          window.open(res.url, "_blank", "noopener");
        }
      } else {
        toast.error(res.message || "Action failed");
      }
      // Refresh report data to reflect updated action statuses
      queryClient.invalidateQueries({
        queryKey: KEYS.report(connectionId, reportId),
      });
    },
    onError: (err) => {
      toast.error(`Failed to execute action: ${err.message}`);
    },
  });

  const Icon = ACTION_ICONS[action.type];
  const isCompleted = action.status === "completed" || result?.success;
  const isFailed = action.status === "failed" || result?.success === false;
  const isRunning =
    action.status === "in-progress" || executeMutation.isPending;

  // Link actions just open the URL directly
  if (action.type === "link") {
    const url = action.params?.url as string | undefined;
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => url && window.open(url, "_blank", "noopener")}
        disabled={!url}
      >
        <LinkExternal01 size={14} />
        {action.label}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5",
            isCompleted &&
              "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
            isFailed && "border-red-500/30 text-red-600 dark:text-red-400",
          )}
          disabled={isRunning}
        >
          {isRunning ? (
            <Loading01 size={14} className="animate-spin" />
          ) : isCompleted ? (
            <CheckCircle size={14} />
          ) : isFailed ? (
            <XCircle size={14} />
          ) : (
            <Icon size={14} />
          )}
          {action.label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {ACTION_LABELS[action.type]}: {action.label}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action.description ||
              `Are you sure you want to execute this action? This will ${ACTION_LABELS[action.type].toLowerCase()}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => executeMutation.mutate()}
            disabled={executeMutation.isPending}
          >
            {executeMutation.isPending ? (
              <>
                <Loading01 size={14} className="animate-spin mr-1" />
                Executing...
              </>
            ) : (
              "Execute"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Actions List
// ---------------------------------------------------------------------------

export function ReportActions({
  reportId,
  actions,
}: {
  reportId: string;
  actions: ReportAction[];
}) {
  if (actions.length === 0) return null;

  // Group by status
  const pending = actions.filter((a) => !a.status || a.status === "pending");
  const completed = actions.filter((a) => a.status === "completed");
  const failed = actions.filter((a) => a.status === "failed");
  const inProgress = actions.filter((a) => a.status === "in-progress");

  const groups = [
    { label: "In Progress", items: inProgress },
    { label: "Available", items: pending },
    { label: "Completed", items: completed },
    { label: "Failed", items: failed },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Actions</h3>
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.items.map((action) => (
              <ActionItem key={action.id} action={action} reportId={reportId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
