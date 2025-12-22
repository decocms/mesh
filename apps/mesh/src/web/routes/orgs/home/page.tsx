/**
 * Organization Home Page
 *
 * Displays either a mesh visualization (graph view) or dashboard view
 * with KPIs, recent activity, and top tools.
 */

import type { ConnectionEntity } from "@/tools/connection/schema";
import type { GatewayEntity } from "@/tools/gateway/schema";
import { createToolCaller } from "@/tools/client";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deco/ui/components/toggle-group.tsx";
import { ViewModeToggle } from "@deco/ui/components/view-mode-toggle.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useNavigate } from "@tanstack/react-router";
import {
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Suspense, useState } from "react";
import { MonitoringKPIs } from "./monitoring-kpis.tsx";
import {
  hasMonitoringActivity,
  type MonitoringLogWithGateway,
  type MonitoringLogsWithGatewayResponse,
  type MonitoringStats,
} from "./monitoring-types.ts";
import { RecentActivity } from "./recent-activity.tsx";
import { TopTools } from "./top-tools.tsx";

// ============================================================================
// Types
// ============================================================================

type ViewMode = "graph" | "dashboard";
type MetricsMode = "requests" | "errors" | "latency";

interface NodeMetric {
  requests: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number;
}

interface NodeMetricsMap {
  gateways: Map<string, NodeMetric>;
  connections: Map<string, NodeMetric>;
}

interface ColorScheme {
  edgeColor: string;
  textClass: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_ITEMS = 10;
const GATEWAY_NODE_HEIGHT = 56;
const SERVER_NODE_HEIGHT = 56;
const NODE_WIDTH = 220;
const MESH_NODE_SIZE = 56;

const COLOR_SCHEMES: Record<MetricsMode, ColorScheme> = {
  requests: {
    edgeColor: "var(--chart-1)",
    textClass: "text-chart-1",
  },
  errors: {
    edgeColor: "var(--chart-3)",
    textClass: "text-chart-3",
  },
  latency: {
    edgeColor: "var(--chart-4)",
    textClass: "text-chart-4",
  },
};

// ============================================================================
// Helpers
// ============================================================================

function aggregateMetrics(logs: MonitoringLogWithGateway[]): NodeMetricsMap {
  const gatewayMetrics = new Map<
    string,
    { requests: number; errors: number; totalLatency: number }
  >();
  const connectionMetrics = new Map<
    string,
    { requests: number; errors: number; totalLatency: number }
  >();

  for (const log of logs) {
    const connId = log.connectionId;
    if (connId) {
      const existing = connectionMetrics.get(connId) ?? {
        requests: 0,
        errors: 0,
        totalLatency: 0,
      };
      connectionMetrics.set(connId, {
        requests: existing.requests + 1,
        errors: existing.errors + (log.isError ? 1 : 0),
        totalLatency: existing.totalLatency + log.durationMs,
      });
    }

    const gatewayId = log.gatewayId;
    if (gatewayId) {
      const existing = gatewayMetrics.get(gatewayId) ?? {
        requests: 0,
        errors: 0,
        totalLatency: 0,
      };
      gatewayMetrics.set(gatewayId, {
        requests: existing.requests + 1,
        errors: existing.errors + (log.isError ? 1 : 0),
        totalLatency: existing.totalLatency + log.durationMs,
      });
    }
  }

  const gateways = new Map<string, NodeMetric>();
  for (const [id, data] of gatewayMetrics) {
    gateways.set(id, {
      requests: data.requests,
      errors: data.errors,
      errorRate: data.requests > 0 ? (data.errors / data.requests) * 100 : 0,
      avgLatencyMs: data.requests > 0 ? data.totalLatency / data.requests : 0,
    });
  }

  const connections = new Map<string, NodeMetric>();
  for (const [id, data] of connectionMetrics) {
    connections.set(id, {
      requests: data.requests,
      errors: data.errors,
      errorRate: data.requests > 0 ? (data.errors / data.requests) * 100 : 0,
      avgLatencyMs: data.requests > 0 ? data.totalLatency / data.requests : 0,
    });
  }

  return { gateways, connections };
}

function formatMetricValue(
  metric: NodeMetric | undefined,
  mode: MetricsMode,
): string {
  if (!metric) return "—";

  switch (mode) {
    case "requests":
      return metric.requests === 0 ? "—" : metric.requests.toLocaleString();
    case "errors":
      return metric.errorRate === 0 ? "—" : `${metric.errorRate.toFixed(1)}%`;
    case "latency":
      return metric.avgLatencyMs === 0
        ? "—"
        : `${Math.round(metric.avgLatencyMs)}ms`;
  }
}

function getMetricNumericValue(
  metric: NodeMetric | undefined,
  mode: MetricsMode,
): number {
  if (!metric) return 0;

  switch (mode) {
    case "requests":
      return metric.requests;
    case "errors":
      return metric.errorRate;
    case "latency":
      return metric.avgLatencyMs;
  }
}

// ============================================================================
// Hooks
// ============================================================================

function useNodeMetrics(): NodeMetricsMap {
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsWithGatewayResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 1000, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  return aggregateMetrics(logs);
}

// ============================================================================
// React Flow Node Components
// ============================================================================

interface GatewayNodeData extends Record<string, unknown> {
  gateway: GatewayEntity;
  metricsMode: MetricsMode;
  metric: NodeMetric | undefined;
  colorScheme: ColorScheme;
  org: string;
}

function GatewayNode({ data }: NodeProps<Node<GatewayNodeData>>) {
  const navigate = useNavigate();
  const metricValue = formatMetricValue(data.metric, data.metricsMode);

  const handleClick = () => {
    navigate({
      to: "/$org/monitoring",
      params: { org: data.org },
      search: {
        from: "now-24h",
        to: "now",
        gatewayId: [data.gateway.id],
        ...(data.metricsMode === "errors" && { status: "errors" as const }),
      },
    });
  };

  return (
    <div
      className="relative flex h-15 max-w-3xs shrink-0 items-center gap-2 pl-1.5 pr-3 bg-background rounded-lg border-shadow nodrag nopan cursor-pointer before:absolute before:inset-0 before:rounded-lg before:bg-accent/25 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-800 before:pointer-events-none"
      onClick={handleClick}
    >
      <IntegrationIcon
        icon={data.gateway.icon}
        name={data.gateway.title}
        size="md"
        fallbackIcon="network_node"
        className="relative z-10"
      />
      <div className="relative z-10 flex flex-col min-w-0 flex-1">
        <span className="text-sm text-muted-foreground truncate">
          {data.gateway.title}
        </span>
        <span
          className={cn(
            "text-base leading-[1] font-semibold tabular-nums",
            data.colorScheme.textClass,
          )}
        >
          {metricValue}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: "8px",
          height: "8px",
          background: data.colorScheme.edgeColor,
          border: "none",
        }}
      />
    </div>
  );
}

interface ServerNodeData extends Record<string, unknown> {
  connection: ConnectionEntity;
  metricsMode: MetricsMode;
  metric: NodeMetric | undefined;
  colorScheme: ColorScheme;
  org: string;
}

function ServerNode({ data }: NodeProps<Node<ServerNodeData>>) {
  const navigate = useNavigate();
  const metricValue = formatMetricValue(data.metric, data.metricsMode);

  const handleClick = () => {
    navigate({
      to: "/$org/monitoring",
      params: { org: data.org },
      search: {
        from: "now-24h",
        to: "now",
        connectionId: [data.connection.id],
        ...(data.metricsMode === "errors" && { status: "errors" as const }),
      },
    });
  };

  return (
    <div
      className="relative flex h-15 max-w-3xs shrink-0 items-center gap-2 pl-1.5 pr-3 bg-background rounded-lg border-shadow nodrag nopan cursor-pointer before:absolute before:inset-0 before:rounded-lg before:bg-accent/25 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-800 before:pointer-events-none"
      onClick={handleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: "8px",
          height: "8px",
          background: "var(--background)",
          border: `1px solid ${data.colorScheme.edgeColor}`,
          pointerEvents: "none",
          cursor: "default",
        }}
      />
      <IntegrationIcon
        icon={data.connection.icon}
        name={data.connection.title}
        size="md"
        fallbackIcon="extension"
        className="relative z-10"
      />
      <div className="relative z-10 flex flex-col min-w-0 flex-1">
        <span className="text-sm text-muted-foreground truncate">
          {data.connection.title}
        </span>
        <span
          className={cn(
            "text-base leading-[1.35] font-semibold tabular-nums",
            data.colorScheme.textClass,
          )}
        >
          {metricValue}
        </span>
      </div>
    </div>
  );
}

interface MeshNodeData extends Record<string, unknown> {
  org: string;
  colorScheme: ColorScheme;
}

function MeshNode({ data }: NodeProps<Node<MeshNodeData>>) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({
      to: "/$org/monitoring",
      params: { org: data.org },
    });
  };

  return (
    <div
      className="flex h-14 w-14 items-center justify-center p-2 bg-primary border border-primary-foreground/50 rounded-lg shadow-sm cursor-pointer"
      onClick={handleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          opacity: 0,
          pointerEvents: "none",
        }}
      />
      <img src="/logos/deco logo.svg" alt="Deco" className="h-8 w-8" />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

const nodeTypes = {
  gateway: GatewayNode,
  server: ServerNode,
  mesh: MeshNode,
};

// ============================================================================
// Mesh Visualization Components
// ============================================================================

function MetricsModeSelector({
  value,
  onChange,
}: {
  value: MetricsMode;
  onChange: (mode: MetricsMode) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as MetricsMode)}
      variant="outline"
      size="sm"
      className="bg-background/80 backdrop-blur-sm"
    >
      <ToggleGroupItem value="requests" className="text-xs px-3 cursor-pointer">
        Tool Calls
      </ToggleGroupItem>
      <ToggleGroupItem value="errors" className="text-xs px-3 cursor-pointer">
        Errors
      </ToggleGroupItem>
      <ToggleGroupItem value="latency" className="text-xs px-3 cursor-pointer">
        Latency
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function MeshVisualization({ showControls }: { showControls: boolean }) {
  const [metricsMode, setMetricsMode] = useState<MetricsMode>("requests");
  const { org } = useProjectContext();

  const rawGateways: GatewayEntity[] = useGateways({ pageSize: MAX_ITEMS });
  const rawConnections: ConnectionEntity[] = useConnections({
    pageSize: MAX_ITEMS,
  });
  const nodeMetrics = useNodeMetrics();

  // Sort by metric value (descending)
  const sortedGateways = [...rawGateways].sort(
    (a, b) =>
      getMetricNumericValue(nodeMetrics.gateways.get(b.id), metricsMode) -
      getMetricNumericValue(nodeMetrics.gateways.get(a.id), metricsMode),
  );

  const sortedConnections = [...rawConnections].sort(
    (a, b) =>
      getMetricNumericValue(nodeMetrics.connections.get(b.id), metricsMode) -
      getMetricNumericValue(nodeMetrics.connections.get(a.id), metricsMode),
  );

  const colorScheme = COLOR_SCHEMES[metricsMode];

  // Build position maps for consistent array order
  const gatewayPositionMap = new Map<string, number>();
  sortedGateways.forEach((g, i) => gatewayPositionMap.set(g.id, i));

  const connectionPositionMap = new Map<string, number>();
  sortedConnections.forEach((c, i) => connectionPositionMap.set(c.id, i));

  // Layout
  const leftX = 0;
  const gapX = 100;
  const meshX = leftX + NODE_WIDTH + gapX;
  const rightX = meshX + MESH_NODE_SIZE + gapX;
  const nodeSpacing = 70;

  const leftCount = rawGateways.length;
  const rightCount = sortedConnections.length;
  const maxCount = Math.max(leftCount, rightCount, 1);
  const totalHeight = (maxCount - 1) * nodeSpacing;
  const centerStartY = -totalHeight / 2;

  const edgeStyle = {
    stroke: colorScheme.edgeColor,
    strokeWidth: 1.25,
    strokeDasharray: "8 6",
    strokeLinecap: "square",
  } as const;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Gateway nodes
  rawGateways.forEach((gateway) => {
    const idx = gatewayPositionMap.get(gateway.id) ?? 0;
    const offsetY = centerStartY + ((maxCount - leftCount) * nodeSpacing) / 2;
    const y = offsetY + idx * nodeSpacing - GATEWAY_NODE_HEIGHT / 2;

    nodes.push({
      id: `gateway-${gateway.id}`,
      type: "gateway",
      position: { x: leftX, y },
      data: {
        gateway,
        metricsMode,
        metric: nodeMetrics.gateways.get(gateway.id),
        colorScheme,
        org: org.slug,
      },
      draggable: false,
      selectable: false,
    });

    edges.push({
      id: `e-gw-${gateway.id}`,
      source: `gateway-${gateway.id}`,
      target: "mesh",
      type: "smoothstep",
      animated: true,
      style: edgeStyle,
    });
  });

  // Mesh node
  nodes.push({
    id: "mesh",
    type: "mesh",
    position: { x: meshX, y: -MESH_NODE_SIZE / 2 },
    data: { org: org.slug, colorScheme },
    draggable: false,
    selectable: false,
  });

  // Server nodes
  sortedConnections.forEach((connection) => {
    const idx = connectionPositionMap.get(connection.id) ?? 0;
    const offsetY = centerStartY + ((maxCount - rightCount) * nodeSpacing) / 2;
    const y = offsetY + idx * nodeSpacing - SERVER_NODE_HEIGHT / 2;

    nodes.push({
      id: `server-${connection.id}`,
      type: "server",
      position: { x: rightX, y },
      data: {
        connection,
        metricsMode,
        metric: nodeMetrics.connections.get(connection.id),
        colorScheme,
        org: org.slug,
      },
      draggable: false,
      selectable: false,
    });

    edges.push({
      id: `e-srv-${connection.id}`,
      source: "mesh",
      target: `server-${connection.id}`,
      type: "smoothstep",
      animated: true,
      style: edgeStyle,
    });
  });

  const dotPattern = {
    backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1.5px)`,
    backgroundSize: "32px 32px",
  };

  return (
    <div
      className="w-full h-full min-h-[420px] relative mesh-minimap bg-background"
      style={dotPattern}
    >
      <style>{`
        .mesh-minimap .react-flow__node { transition: transform 300ms ease-out; }
        .mesh-minimap .react-flow__edge path { transition: d 300ms ease-out; }
        .mesh-minimap .react-flow__edge.animated path {
          animation: dashdraw 0.8s linear infinite;
        }
        @keyframes dashdraw {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -14;
          }
        }
      `}</style>

      {showControls && (
        <div className="absolute top-4 right-4 z-10">
          <MetricsModeSelector value={metricsMode} onChange={setMetricsMode} />
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
        panOnScroll={false}
        panOnDrag={true}
        preventScrolling={true}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      />
    </div>
  );
}

function MeshVisualizationSkeleton() {
  return (
    <div className="bg-background p-5 h-full min-h-[420px] flex items-center justify-center">
      <div className="flex items-center gap-16">
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 w-[220px] bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>
        <div className="h-14 w-28 bg-muted animate-pulse rounded-xl" />
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 w-[220px] bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Welcome Overlay
// ============================================================================

function WelcomeOverlay() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: stats } = useToolCall<
    { startDate: string; endDate: string },
    MonitoringStats
  >({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: dateRange,
    scope: locator,
    staleTime: 60_000,
    refetchInterval: (query) =>
      hasMonitoringActivity(query.state.data) ? false : 1_000,
  });

  if (hasMonitoringActivity(stats)) return null;

  const handleAddMcp = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const handleBrowseStore = () => {
    navigate({ to: "/$org/store", params: { org: org.slug } });
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 bg-background/80 backdrop-blur-[3px] z-10">
      <div className="max-w-md w-full bg-background rounded-xl border border-border shadow-lg pointer-events-auto overflow-hidden">
        <div className="p-2">
          <div className="bg-muted border border-border rounded-lg h-[250px] overflow-hidden flex items-center justify-center">
            <img
              src="/empty-state-home.png"
              alt="MCP Mesh illustration"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="px-6 py-6 space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Welcome to your MCP Mesh
          </h2>
          <p className="text-sm text-muted-foreground leading-normal">
            Connect your first MCP server to unlock real-time metrics, activity
            logs, and analytics right here on your home.
          </p>
        </div>

        <div className="border-t border-border px-4 py-4 flex items-center justify-center gap-2">
          <Button onClick={handleBrowseStore} size="sm" className="h-9">
            <Icon name="shopping_bag" size={16} />
            Browse Store
          </Button>
          <Button
            variant="outline"
            onClick={handleAddMcp}
            size="sm"
            className="h-9"
          >
            <Icon name="add" size={16} />
            Connect MCP Server
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard View
// ============================================================================

function DashboardView() {
  return (
    <div className="h-full">
      {/* Grid with internal dividers only */}
      <div className="grid grid-cols-1 lg:grid-cols-6 lg:grid-rows-[auto_1fr] gap-[0.5px] bg-border h-full">
        {/* Row 1: 3 KPI bar charts */}
        <div className="lg:col-span-6">
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load monitoring stats
              </div>
            }
          >
            <Suspense fallback={<MonitoringKPIs.Skeleton />}>
              <MonitoringKPIs.Content />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Row 2: Recent Activity + Top Tools */}
        <div className="lg:col-span-3 min-h-0 overflow-hidden">
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load recent activity
              </div>
            }
          >
            <Suspense fallback={<RecentActivity.Skeleton />}>
              <RecentActivity />
            </Suspense>
          </ErrorBoundary>
        </div>

        <div className="lg:col-span-3 min-h-0 overflow-hidden">
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load top tools
              </div>
            }
          >
            <Suspense fallback={<TopTools.Skeleton />}>
              <TopTools />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function OrgHomePage() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("org-home-view-mode");
    return stored === "dashboard" || stored === "graph" ? stored : "dashboard";
  });

  // Check if there's monitoring activity to show/hide controls
  const { data: stats } = useToolCall<
    { startDate: string; endDate: string },
    MonitoringStats
  >({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: dateRange,
    scope: locator,
    staleTime: 60_000,
    refetchInterval: (query) =>
      hasMonitoringActivity(query.state.data) ? false : 1_000,
  });

  const showControls = hasMonitoringActivity(stats);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("org-home-view-mode", mode);
  };

  const handleAddMcp = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  return (
    <CollectionPage>
      <WelcomeOverlay />

      <CollectionHeader
        title={org.name}
        ctaButton={
          <div className="flex items-center gap-2">
            {showControls && (
              <ViewModeToggle
                value={viewMode}
                onValueChange={handleViewModeChange}
                size="sm"
                options={[
                  { value: "dashboard", icon: "bar_chart" },
                  { value: "graph", icon: "account_tree" },
                ]}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3"
              onClick={handleAddMcp}
            >
              <Icon name="add" size={16} />
              Connect MCP Server
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto relative">
        {viewMode === "graph" ? (
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground h-full flex items-center justify-center">
                Failed to load mesh visualization
              </div>
            }
          >
            <Suspense fallback={<MeshVisualizationSkeleton />}>
              <MeshVisualization showControls={showControls} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <DashboardView />
        )}
      </div>
    </CollectionPage>
  );
}
