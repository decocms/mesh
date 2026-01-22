/**
 * Mesh Visualization Components
 *
 * React Flow-based visualization of the MCP Mesh showing agents (virtual MCPs),
 * connections, and their metrics.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { CpuChip02, Container } from "@untitledui/icons";
import {
  useConnections,
  useMCPClient,
  useMCPToolCall,
  useProjectContext,
  useVirtualMCPs,
  WellKnownOrgMCPId,
  type ConnectionEntity,
  type VirtualMCPEntity,
} from "@decocms/mesh-sdk";
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
import { createContext, useContext, useState } from "react";
import type {
  MonitoringLogWithVirtualMCP,
  MonitoringLogsWithVirtualMCPResponse,
} from "@/web/components/monitoring";

// ============================================================================
// Types
// ============================================================================

export type MetricsMode = "requests" | "errors" | "latency";

// ============================================================================
// Context
// ============================================================================

interface MetricsModeContextValue {
  metricsMode: MetricsMode;
  setMetricsMode: (mode: MetricsMode) => void;
}

const MetricsModeContext = createContext<MetricsModeContextValue | undefined>(
  undefined,
);

function useMetricsMode() {
  const context = useContext(MetricsModeContext);
  if (!context) {
    throw new Error("useMetricsMode must be used within MetricsModeProvider");
  }
  return context;
}

export function MetricsModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [metricsMode, setMetricsMode] = useState<MetricsMode>("requests");

  return (
    <MetricsModeContext.Provider value={{ metricsMode, setMetricsMode }}>
      {children}
    </MetricsModeContext.Provider>
  );
}

interface NodeMetric {
  requests: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number;
}

interface NodeMetricsMap {
  virtualMcps: Map<string, NodeMetric>;
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
// Size of the edge nodes (agents + servers). React Flow measures DOM nodes,
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

function getLast24HoursDateRange() {
  // Round to the nearest 5 minutes to avoid infinite re-suspending
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  const roundedNow = Math.floor(now / fiveMinutes) * fiveMinutes;
  const endDate = new Date(roundedNow);
  const startDate = new Date(roundedNow - 24 * 60 * 60 * 1000);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

function aggregateMetrics(logs: MonitoringLogWithVirtualMCP[]): NodeMetricsMap {
  const virtualMcpMetrics = new Map<
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

    const virtualMcpId = log.virtualMcpId;
    if (virtualMcpId) {
      const existing = virtualMcpMetrics.get(virtualMcpId) ?? {
        requests: 0,
        errors: 0,
        totalLatency: 0,
      };
      virtualMcpMetrics.set(virtualMcpId, {
        requests: existing.requests + 1,
        errors: existing.errors + (log.isError ? 1 : 0),
        totalLatency: existing.totalLatency + log.durationMs,
      });
    }
  }

  const virtualMcps = new Map<string, NodeMetric>();
  for (const [id, data] of virtualMcpMetrics) {
    virtualMcps.set(id, {
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

  return { virtualMcps, connections };
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
  const { org } = useProjectContext();
  const dateRange = getLast24HoursDateRange();

  const client = useMCPClient({
    connectionId: WellKnownOrgMCPId.SELF(org.id),
    orgId: org.id,
  });

  const { data: logsData } =
    useMCPToolCall<MonitoringLogsWithVirtualMCPResponse>({
      client,
      toolName: "MONITORING_LOGS_LIST",
      toolArguments: { ...dateRange, limit: 1000, offset: 0 },
      staleTime: 30_000,
      select: (result) =>
        ((result as { structuredContent?: unknown }).structuredContent ??
          result) as MonitoringLogsWithVirtualMCPResponse,
    });

  const logs = logsData?.logs ?? [];
  return aggregateMetrics(logs);
}

// ============================================================================
// React Flow Node Components
// ============================================================================

interface AgentNodeData extends Record<string, unknown> {
  virtualMcp: VirtualMCPEntity;
  metricsMode: MetricsMode;
  metric: NodeMetric | undefined;
  colorScheme: ColorScheme;
  org: string;
}

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const navigate = useNavigate();
  const metricValue = formatMetricValue(data.metric, data.metricsMode);

  const handleClick = () => {
    navigate({
      to: "/$org/agents/$agentId",
      params: { org: data.org, agentId: data.virtualMcp.id },
    });
  };

  return (
    <div
      className="relative flex shrink-0 items-center gap-2 pl-1.5 pr-3 bg-background rounded-lg border-shadow nodrag nopan cursor-pointer pointer-events-auto before:absolute before:inset-0 before:rounded-lg before:bg-accent/25 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-800 before:pointer-events-none"
      style={{ height: EDGE_NODE_HEIGHT, width: EDGE_NODE_WIDTH }}
      onClick={handleClick}
    >
      <IntegrationIcon
        icon={data.virtualMcp.icon}
        name={data.virtualMcp.title}
        size="md"
        fallbackIcon={<CpuChip02 />}
        className="relative z-10"
      />
      <div className="relative z-10 flex flex-col min-w-0 flex-1">
        <span className="text-sm text-muted-foreground truncate">
          {data.virtualMcp.title}
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
      to: "/$org/mcps/$connectionId",
      params: { org: data.org, connectionId: data.connection.id },
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
        fallbackIcon={<Container />}
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
      to: "/$org/store",
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
  agent: AgentNode,
  server: ServerNode,
  mesh: MeshNode,
};

// ============================================================================
// Mesh Visualization Components
// ============================================================================

export function MetricsModeSelector() {
  const { metricsMode, setMetricsMode } = useMetricsMode();

  return (
    <ToggleGroup
      type="single"
      value={metricsMode}
      onValueChange={(v) => v && setMetricsMode(v as MetricsMode)}
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

export function MeshVisualization() {
  const { metricsMode } = useMetricsMode();
  const { org } = useProjectContext();

  const rawVirtualMcps: VirtualMCPEntity[] = useVirtualMCPs({
    pageSize: MAX_ITEMS,
  });
  const rawConnections: ConnectionEntity[] = useConnections({
    pageSize: MAX_ITEMS,
  });
  const nodeMetrics = useNodeMetrics();

  // Sort by metric value (descending)
  const sortedVirtualMcps = [...rawVirtualMcps].sort(
    (a, b) =>
      getMetricNumericValue(nodeMetrics.virtualMcps.get(b.id), metricsMode) -
      getMetricNumericValue(nodeMetrics.virtualMcps.get(a.id), metricsMode),
  );

  const sortedConnections = [...rawConnections].sort(
    (a, b) =>
      getMetricNumericValue(nodeMetrics.connections.get(b.id), metricsMode) -
      getMetricNumericValue(nodeMetrics.connections.get(a.id), metricsMode),
  );

  const colorScheme = COLOR_SCHEMES[metricsMode];

  // Build position maps from sorted arrays (maps node ID to sorted index)
  const virtualMcpPositionMap = new Map<string, number>();
  sortedVirtualMcps.forEach((g, i) => virtualMcpPositionMap.set(g.id, i));

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

  const leftCount = sortedVirtualMcps.length;
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

  // Agent nodes - iterate over rawVirtualMcps in stable order (by ID) for React Flow tracking
  // but use sorted position for visual layout, centered relative to mesh node
  const stableVirtualMcps = [...rawVirtualMcps].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  stableVirtualMcps.forEach((virtualMcp) => {
    const sortedIdx = virtualMcpPositionMap.get(virtualMcp.id) ?? 0;
    // Calculate center Y relative to mesh center (y=0)
    const nodeCenterY = (sortedIdx - (leftCount - 1) / 2) * nodeSpacing;
    const y = nodeCenterY - EDGE_NODE_HEIGHT / 2;

    nodes.push({
      id: `agent-${virtualMcp.id}`,
      type: "agent",
      position: { x: leftX, y },
      data: {
        virtualMcp,
        metricsMode,
        metric: nodeMetrics.virtualMcps.get(virtualMcp.id),
        colorScheme,
        org: org.slug,
      },
      draggable: false,
      selectable: false,
    });

    edges.push({
      id: `e-agent-${virtualMcp.id}`,
      source: `agent-${virtualMcp.id}`,
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
