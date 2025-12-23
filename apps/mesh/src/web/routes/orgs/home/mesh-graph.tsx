/**
 * Mesh Visualization Components
 *
 * React Flow-based visualization of the MCP Mesh showing gateways,
 * connections, and their metrics.
 */

import type { ConnectionEntity } from "@/tools/connection/schema";
import type { GatewayEntity } from "@/tools/gateway/schema";
import { createToolCaller } from "@/tools/client";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deco/ui/components/toggle-group.tsx";
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
import { useState } from "react";
import {
  type MonitoringLogWithGateway,
  type MonitoringLogsWithGatewayResponse,
} from "./monitoring-types.ts";

// ============================================================================
// Types
// ============================================================================

export type MetricsMode = "requests" | "errors" | "latency";

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
// Size of the edge nodes (gateways + servers). React Flow measures DOM nodes,
// so keep these in sync with the rendered card sizes.
const EDGE_NODE_HEIGHT = 56;
const EDGE_NODE_WIDTH = 220;

// Size of the central mesh node (square). Keep in sync with the rendered node.
const CENTRAL_NODE_SIZE = 56;

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
      className="relative flex shrink-0 items-center gap-2 pl-1.5 pr-3 bg-background rounded-lg border-shadow nodrag nopan cursor-pointer pointer-events-auto before:absolute before:inset-0 before:rounded-lg before:bg-accent/25 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-800 before:pointer-events-none"
      style={{ height: EDGE_NODE_HEIGHT, width: EDGE_NODE_WIDTH }}
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
            "text-base leading-none font-semibold tabular-nums",
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
      className="relative flex shrink-0 items-center gap-2 pl-1.5 pr-3 bg-background rounded-lg border-shadow nodrag nopan cursor-pointer pointer-events-auto before:absolute before:inset-0 before:rounded-lg before:bg-accent/25 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-800 before:pointer-events-none"
      style={{ height: EDGE_NODE_HEIGHT, width: EDGE_NODE_WIDTH }}
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
      className="flex items-center justify-center p-2 bg-primary border border-primary-foreground/50 rounded-lg shadow-sm cursor-pointer pointer-events-auto"
      style={{ height: CENTRAL_NODE_SIZE, width: CENTRAL_NODE_SIZE }}
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

export function MeshVisualization({ showControls }: { showControls: boolean }) {
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

  // Build position maps from sorted arrays (maps node ID to sorted index)
  const gatewayPositionMap = new Map<string, number>();
  sortedGateways.forEach((g, i) => gatewayPositionMap.set(g.id, i));

  const connectionPositionMap = new Map<string, number>();
  sortedConnections.forEach((c, i) => connectionPositionMap.set(c.id, i));

  // Layout
  // We place the mesh node at the origin (its center at x=0,y=0), and derive
  // edge nodes positions from it.
  const gapX = 100;
  const meshLeft = -CENTRAL_NODE_SIZE / 2;
  const meshRight = CENTRAL_NODE_SIZE / 2;

  // Maintain a constant gap between edge nodes and the mesh node.
  const leftX = meshLeft - gapX - EDGE_NODE_WIDTH;
  const rightX = meshRight + gapX;
  const nodeSpacing = 70;

  const leftCount = sortedGateways.length;
  const rightCount = sortedConnections.length;

  const edgeStyle = {
    stroke: colorScheme.edgeColor,
    strokeWidth: 1.25,
    strokeDasharray: "8 6",
    strokeLinecap: "square",
  } as const;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Mesh node - positioned at center (y=0) first, all other nodes derive from this
  nodes.push({
    id: "mesh",
    type: "mesh",
    position: { x: meshLeft, y: -CENTRAL_NODE_SIZE / 2 },
    data: { org: org.slug, colorScheme },
    draggable: false,
    selectable: false,
  });

  // Gateway nodes - iterate over rawGateways in stable order (by ID) for React Flow tracking
  // but use sorted position for visual layout, centered relative to mesh node
  const stableGateways = [...rawGateways].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  stableGateways.forEach((gateway) => {
    const sortedIdx = gatewayPositionMap.get(gateway.id) ?? 0;
    // Calculate center Y relative to mesh center (y=0)
    const nodeCenterY = (sortedIdx - (leftCount - 1) / 2) * nodeSpacing;
    const y = nodeCenterY - EDGE_NODE_HEIGHT / 2;

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

  // Server nodes - iterate over rawConnections in stable order (by ID) for React Flow tracking
  // but use sorted position for visual layout, centered relative to mesh node
  const stableConnections = [...rawConnections].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  stableConnections.forEach((connection) => {
    const sortedIdx = connectionPositionMap.get(connection.id) ?? 0;
    // Calculate center Y relative to mesh center (y=0)
    const nodeCenterY = (sortedIdx - (rightCount - 1) / 2) * nodeSpacing;
    const y = nodeCenterY - EDGE_NODE_HEIGHT / 2;

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

export function MeshVisualizationSkeleton() {
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
