import {
  WellKnownMCPId,
  getWellKnownRegistryConnection,
} from "@/core/well-known-mcp";
import { createToolCaller } from "@/tools/client";
import {
  useConnectionActions,
  useConnections,
} from "@/web/hooks/collections/use-connection";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useMembers } from "@/web/hooks/use-members";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Card } from "@deco/ui/components/card.tsx";
import { useNavigate } from "@tanstack/react-router";
import { MetricCard, QuickstartButton } from "./metric-card.tsx";

interface MonitoringStats {
  totalCalls: number;
  errorRate: number;
  avgDurationMs: number;
  errorRatePercent: string;
}

function MeshStatsContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const connections = useConnections() ?? [];
  const toolCaller = createToolCaller();
  const actions = useConnectionActions();

  // Calculate date range for last 24 hours
  const now = new Date();
  const startDate = new Date();
  startDate.setHours(now.getHours() - 24);
  // Round to nearest minute to ensure stable query keys
  startDate.setSeconds(0, 0);
  const endDate = new Date(now);
  endDate.setHours(endDate.getHours() + 1);
  endDate.setSeconds(0, 0);
  const dateRange = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  const { data: stats } = useToolCall<
    { startDate: string; endDate: string },
    MonitoringStats
  >({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: dateRange,
    staleTime: 60_000,
  });

  // Get members data using the Suspense hook
  const { data: membersResponse } = useMembers();

  const totalMembers = membersResponse?.data?.total ?? 0;

  // Compute connection stats
  const totalConnections = connections.length;
  const activeConnections = connections.filter(
    (c) => c.status === "active",
  ).length;
  const inactiveConnections = totalConnections - activeConnections;

  // Find first non-registry active connection
  const firstMcpConnection = connections.find(
    (c) => c.id !== WellKnownMCPId.REGISTRY && c.status === "active",
  );

  // Get session for registry installation
  const { data: session } = authClient.useSession();

  // Handle registry connection installation
  const handleInstallRegistry = async () => {
    if (!org || !session?.user?.id) {
      return;
    }

    const registryData = {
      ...getWellKnownRegistryConnection(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: session.user.id,
      organization_id: org.id,
      tools: null,
      bindings: null,
      status: "inactive" as const,
    };

    try {
      await actions.create.mutateAsync(registryData);
    } catch (error) {
      console.error("Failed to install registry connection:", error);
    }
  };

  // Handle navigation to monitoring
  const handleGoToMonitoring = (search?: Record<string, string>) => () => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
      search,
    });
  };

  // Handle navigation to members
  const handleGoToMembers = () => {
    navigate({
      to: "/$org/members",
      params: { org: org.slug },
    });
  };

  // Handle navigation to mcps
  const handleGoToConnections = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
    });
  };

  const totalCalls = stats?.totalCalls ?? 0;
  const errorRate = stats?.errorRate ?? 0;
  const avgDurationMs = stats?.avgDurationMs ?? 0;

  const metrics = [
    {
      label: "Connections",
      value: totalConnections.toLocaleString(),
      subValue: `${activeConnections} active, ${inactiveConnections} inactive`,
      onClick: totalConnections > 0 ? handleGoToConnections : undefined,
      quickstartContent:
        totalConnections === 0 ? (
          <QuickstartButton
            label="Add Registry MCP"
            description="Use thousands of MCPs from the Community Registry"
            icon="add"
            onClick={handleInstallRegistry}
            isLoading={actions.create.isPending}
          />
        ) : undefined,
    },
    {
      label: "Tool Calls (24h)",
      value: totalCalls.toLocaleString(),
      subValue: "Last 24 hours",
      onClick: handleGoToMonitoring(),
      quickstartContent:
        totalCalls === 0 && totalConnections > 0 && firstMcpConnection ? (
          <QuickstartButton
            label="Make your first tool call"
            description={`Try calling a tool from ${firstMcpConnection.title}`}
            icon="chat"
            onClick={handleGoToMonitoring()}
          />
        ) : undefined,
    },
    {
      label: "Error Rate (24h)",
      value: `${(errorRate * 100).toFixed(1)}%`,
      subValue: `${((1 - errorRate) * 100).toFixed(1)}% reliability`,
      onClick:
        errorRate > 0 ? handleGoToMonitoring({ status: "errors" }) : undefined,
    },
    {
      label: "Latency (24h)",
      value: `${Math.round(avgDurationMs)}ms`,
      subValue: "Average duration",
      onClick: handleGoToMonitoring(),
    },
    {
      label: "Members",
      value: totalMembers > 0 ? totalMembers.toLocaleString() : "0",
      subValue: `${totalMembers} members`,
      onClick: handleGoToMembers,
      quickstartContent:
        totalMembers <= 1 ? (
          <QuickstartButton
            label="Invite members"
            description="Invite team members to collaborate"
            icon="group"
            onClick={handleGoToMembers}
          />
        ) : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric} />
      ))}
    </div>
  );
}

function MeshStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="p-4">
          <div className="space-y-2">
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
            <div className="h-8 w-16 bg-muted rounded animate-pulse" />
            <div className="h-3 w-32 bg-muted rounded animate-pulse" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export const MeshStats = Object.assign(MeshStatsContent, {
  Skeleton: MeshStatsSkeleton,
});
