import { createToolCaller } from "@/tools/client";
import {
  getWellKnownSelfConnection,
  WellKnownMCPId,
} from "@/core/well-known-mcp";
import {
  useConnectionActions,
  useConnections,
} from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useMembers } from "@/web/hooks/use-members";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
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
  const actions = useConnectionActions();
  const { data: session } = authClient.useSession();
  const toolCaller = createToolCaller();

  const dateRange = getLast24HoursDateRange();

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
  const activeConnections = connections.filter((c) => c.status === "active");
  const inactiveConnections = totalConnections - activeConnections.length;

  // First active connection
  const [firstMcpConnection] = activeConnections;

  // Get registry connections
  const registryConnections = useRegistryConnections(connections);
  const totalRegistries = registryConnections.length;
  const hasNoRegistry = totalRegistries === 0;

  const isMeshMcpInstalled = connections.some(
    (c) => c.id === WellKnownMCPId.SELF,
  );
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : (globalThis.location?.origin ?? "");
  const canInstallMeshMcp = !!org && !!session?.user?.id && !!baseUrl;

  const handleInstallMeshMcp = async () => {
    if (!canInstallMeshMcp || isMeshMcpInstalled || actions.create.isPending)
      return;
    await actions.create.mutateAsync(getWellKnownSelfConnection(baseUrl));
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
  const handleGoToConnections = (search?: Record<string, string>) => () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search,
    });
  };

  const handleGoToMeshMcp = () => {
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org: org.slug, connectionId: WellKnownMCPId.SELF },
    });
  };

  // Handle navigation to store
  const handleGoToStore = () => {
    navigate({
      to: "/$org/store",
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
      subValue: `${activeConnections.length} active, ${inactiveConnections} inactive`,
      onClick: totalConnections > 0 ? handleGoToConnections() : undefined,
      quickstartContent:
        totalConnections === 0 ? (
          <QuickstartButton
            label="Add Connection"
            description="Create your first MCP connection"
            icon="add"
            onClick={handleGoToConnections({ action: "create" })}
          />
        ) : undefined,
    },
    {
      label: "Stores",
      value: totalRegistries.toLocaleString(),
      subValue: hasNoRegistry
        ? "No store found"
        : `${totalRegistries} store${totalRegistries !== 1 ? "s" : ""}`,
      onClick: handleGoToStore,
      quickstartContent: hasNoRegistry ? (
        <QuickstartButton
          label="Add Store"
          description="Connect to a store to discover and install MCPs"
          icon="add"
          onClick={handleGoToStore}
        />
      ) : undefined,
    },
    ...(!isMeshMcpInstalled
      ? [
          {
            label: "Mesh MCP",
            value: "Not installed",
            subValue: "Install the management MCP connection",
            onClick: handleGoToMeshMcp,
            quickstartContent: (
              <QuickstartButton
                label="Install Mesh MCP"
                description="Add the management MCP connection to this org"
                icon="add"
                onClick={handleInstallMeshMcp}
                isLoading={actions.create.isPending}
              />
            ),
          },
        ]
      : []),
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
    ...(errorRate > 0
      ? [
          {
            label: "Error Rate (24h)",
            value: `${(errorRate * 100).toFixed(1)}%`,
            subValue: `${((1 - errorRate) * 100).toFixed(1)}% reliability`,
            onClick:
              errorRate > 0
                ? handleGoToMonitoring({ status: "errors" })
                : undefined,
          },
        ]
      : []),
    ...(totalCalls > 0
      ? [
          {
            label: "Latency (24h)",
            value: `${Math.round(avgDurationMs)}ms`,
            subValue: "Average duration",
            onClick: handleGoToMonitoring(),
          },
        ]
      : []),
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
      {[...Array(6)].map((_, i) => (
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
