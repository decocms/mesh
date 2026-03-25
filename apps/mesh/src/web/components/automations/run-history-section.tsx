/**
 * Run History Section for automations.
 * Shows past automation runs with real-time status updates.
 */

import { EmptyState } from "@/web/components/empty-state.tsx";
import { useChat } from "@/web/components/chat/index";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { useDecopilotEvents } from "@/web/hooks/use-decopilot-events.ts";
import { KEYS } from "@/web/lib/query-keys.ts";
import { getStatusConfig } from "@/web/lib/task-status.ts";
import { useProjectContext } from "@decocms/mesh-sdk";
import { SELF_MCP_ALIAS_ID, useMCPClient } from "@decocms/mesh-sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loading01 } from "@untitledui/icons";
import { formatDistanceToNow } from "date-fns";

interface RunThread {
  id: string;
  title: string;
  status: string;
  updated_at: string;
}

function useAutomationRuns(
  orgId: string,
  automationId: string,
  triggerIds: string[],
) {
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId,
  });

  return useQuery({
    queryKey: KEYS.automationRuns(orgId, automationId, triggerIds),
    queryFn: async () => {
      if (!client) throw new Error("MCP client not available");
      const result = (await client.callTool({
        name: "COLLECTION_THREADS_LIST",
        arguments: { where: { trigger_ids: triggerIds }, limit: 20 },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as {
        items: RunThread[];
        totalCount: number;
      };
      return payload.items ?? [];
    },
    enabled: triggerIds.length > 0,
  });
}

export function RunHistorySection({
  automationId,
  triggerIds,
}: {
  automationId: string;
  triggerIds: string[];
}) {
  const { org } = useProjectContext();
  const { switchToTask } = useChat();
  const [, setChatOpen] = useDecoChatOpen();
  const queryClient = useQueryClient();
  const { data: runs, isLoading } = useAutomationRuns(
    org.id,
    automationId,
    triggerIds,
  );

  useDecopilotEvents({
    orgId: org.id,
    enabled: triggerIds.length > 0,
    onTaskStatus: (event) => {
      const threadId = event.subject;
      const cached = runs ?? [];
      const existingRun = cached.find((r) => r.id === threadId);
      if (existingRun) {
        queryClient.setQueryData(
          KEYS.automationRuns(org.id, automationId, triggerIds),
          cached.map((r) =>
            r.id === threadId
              ? {
                  ...r,
                  status: event.data.status,
                  updated_at: new Date().toISOString(),
                }
              : r,
          ),
        );
      } else {
        queryClient.invalidateQueries({
          queryKey: KEYS.automationRuns(org.id, automationId, triggerIds),
        });
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loading01 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <EmptyState
        image={null}
        className="mt-6"
        title="No run history"
        description="Run history will appear here when the automation has been triggered."
      />
    );
  }

  const handleRunClick = async (threadId: string) => {
    await switchToTask(threadId);
    setChatOpen(true);
  };

  return (
    <div className="flex flex-col divide-y divide-border">
      {runs.map((run) => {
        const config = getStatusConfig(run.status);
        const StatusIcon = config.icon;
        return (
          <button
            key={run.id}
            type="button"
            className="flex items-center gap-3 px-1 py-2.5 text-left hover:bg-accent/50 transition-colors cursor-pointer rounded-sm"
            onClick={() => handleRunClick(run.id)}
          >
            <StatusIcon size={16} className={config.iconClassName} />
            <span className="flex-1 min-w-0 text-sm truncate">{run.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(run.updated_at), {
                addSuffix: true,
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
