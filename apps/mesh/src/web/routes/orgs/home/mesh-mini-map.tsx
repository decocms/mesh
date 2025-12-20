/**
 * MeshMiniMap - A compact React Flow diagram showing gateways → MCP Mesh → servers
 *
 * Displays up to 3 gateways on the left, the central MCP Mesh node, and up to 3 MCP servers
 * on the right with arrow edges connecting them. Includes integrated metrics display
 * with a mode selector (Requests / Errors / Latency).
 */

import type { ConnectionEntity } from "@/tools/connection/schema";
import type { GatewayEntity } from "@/tools/gateway/schema";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deco/ui/components/toggle-group.tsx";
import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";
import {
  formatMetricValue,
  getMetricNumericValue,
  type MetricsMode,
  type NodeMetric,
  useNodeMetrics,
} from "./use-node-metrics";

const MAX_ITEMS = 10;
const GATEWAY_NODE_HEIGHT = 56;
const SERVER_NODE_HEIGHT = 56;
const NODE_WIDTH = 220;
const MESH_NODE_SIZE = 56;

// ---------- Color Schemes ----------

interface ColorScheme {
  edgeColor: string;
  textClass: string;
  borderClass: string;
  dotColor: string;
}

const COLOR_SCHEMES: Record<MetricsMode, ColorScheme> = {
  requests: {
    edgeColor: "#10b981", // emerald-500
    textClass: "text-emerald-600 dark:text-emerald-400",
    borderClass: "border-emerald-500/40",
    dotColor: "rgba(16, 185, 129, 0.3)", // emerald-500 at 30%
  },
  errors: {
    edgeColor: "#ef4444", // red-500
    textClass: "text-red-600 dark:text-red-400",
    borderClass: "border-red-500/40",
    dotColor: "rgba(239, 68, 68, 0.3)", // red-500 at 30%
  },
  latency: {
    edgeColor: "#8b5cf6", // violet-500
    textClass: "text-violet-600 dark:text-violet-400",
    borderClass: "border-violet-500/40",
    dotColor: "rgba(139, 92, 246, 0.3)", // violet-500 at 30%
  },
};

// ---------- Custom Node Types ----------

interface GatewayNodeData extends Record<string, unknown> {
  gateway: GatewayEntity;
  org: string;
  metricsMode: MetricsMode;
  metric: NodeMetric | undefined;
  colorScheme: ColorScheme;
}

function GatewayNode({ data }: NodeProps<Node<GatewayNodeData>>) {
  const metricValue = formatMetricValue(data.metric, data.metricsMode);

  return (
    <div
      className={cn(
        "flex h-14 w-[220px] shrink-0 items-center gap-3 px-4 py-3 bg-background border rounded-lg shadow-sm nodrag nopan",
        data.colorScheme.borderClass,
      )}
    >
      <IntegrationIcon
        icon={data.gateway.icon}
        name={data.gateway.title}
        size="sm"
        fallbackIcon="network_node"
      />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] text-muted-foreground truncate">
          {data.gateway.title}
        </span>
        <span
          className={cn(
            "text-base font-semibold tabular-nums",
            data.colorScheme.textClass,
          )}
        >
          {metricValue}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-2! h-2! bg-transparent! border-0! opacity-0!"
      />
    </div>
  );
}

interface ServerNodeData extends Record<string, unknown> {
  connection: ConnectionEntity;
  org: string;
  metricsMode: MetricsMode;
  metric: NodeMetric | undefined;
  colorScheme: ColorScheme;
}

function ServerNode({ data }: NodeProps<Node<ServerNodeData>>) {
  const metricValue = formatMetricValue(data.metric, data.metricsMode);

  return (
    <div
      className={cn(
        "flex h-14 w-[220px] shrink-0 items-center gap-3 px-4 py-3 bg-background border rounded-lg shadow-sm nodrag nopan",
        data.colorScheme.borderClass,
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2! h-2! bg-transparent! border-0! opacity-0!"
      />
      <IntegrationIcon
        icon={data.connection.icon}
        name={data.connection.title}
        size="sm"
        fallbackIcon="extension"
      />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] text-muted-foreground truncate">
          {data.connection.title}
        </span>
        <span
          className={cn(
            "text-base font-semibold tabular-nums",
            data.colorScheme.textClass,
          )}
        >
          {metricValue}
        </span>
      </div>
    </div>
  );
}

function MeshNode() {
  return (
    <div className="flex h-14 w-14 items-center justify-center p-2 bg-background border border-border rounded-lg shadow-sm">
      <Handle
        type="target"
        position={Position.Left}
        className="w-2! h-2! bg-transparent! border-0! opacity-0!"
      />
      <img src="/logos/deco logo.svg" alt="Deco" className="h-8 w-8" />
      <Handle
        type="source"
        position={Position.Right}
        className="w-2! h-2! bg-transparent! border-0! opacity-0!"
      />
    </div>
  );
}

const nodeTypes = {
  gateway: GatewayNode,
  server: ServerNode,
  mesh: MeshNode,
};

// ---------- Metrics Mode Selector ----------

interface MetricsModeSelectorProps {
  value: MetricsMode;
  onChange: (mode: MetricsMode) => void;
}

function MetricsModeSelector({ value, onChange }: MetricsModeSelectorProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as MetricsMode)}
      variant="outline"
      size="sm"
      className="bg-background/80 backdrop-blur-sm"
    >
      <ToggleGroupItem value="requests" className="text-xs px-3">
        Requests
      </ToggleGroupItem>
      <ToggleGroupItem value="errors" className="text-xs px-3">
        Errors
      </ToggleGroupItem>
      <ToggleGroupItem value="latency" className="text-xs px-3">
        Latency
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

// ---------- Main Component ----------

function MeshMiniMapContent() {
  const { org } = useProjectContext();
  const [metricsMode, setMetricsMode] = useState<MetricsMode>("requests");

  // Fetch first MAX_ITEMS of each
  const rawGateways: GatewayEntity[] = useGateways({ pageSize: MAX_ITEMS });
  const rawConnections: ConnectionEntity[] = useConnections({
    pageSize: MAX_ITEMS,
  });

  // Fetch metrics
  const nodeMetrics = useNodeMetrics();

  // Sort gateways and connections by metric value (descending - bigger on top)
  const sortedGateways = [...rawGateways].sort((a, b) => {
    const aValue = getMetricNumericValue(
      nodeMetrics.gateways.get(a.id),
      metricsMode,
    );
    const bValue = getMetricNumericValue(
      nodeMetrics.gateways.get(b.id),
      metricsMode,
    );
    return bValue - aValue;
  });

  const sortedConnections = [...rawConnections].sort((a, b) => {
    const aValue = getMetricNumericValue(
      nodeMetrics.connections.get(a.id),
      metricsMode,
    );
    const bValue = getMetricNumericValue(
      nodeMetrics.connections.get(b.id),
      metricsMode,
    );
    return bValue - aValue;
  });

  const colorScheme = COLOR_SCHEMES[metricsMode];

  // Build position maps based on sorted order
  // This allows us to maintain consistent array order while changing positions
  const gatewayPositionMap = new Map<string, number>();
  sortedGateways.forEach((gateway, sortedIndex) => {
    gatewayPositionMap.set(gateway.id, sortedIndex);
  });

  const connectionPositionMap = new Map<string, number>();
  sortedConnections.forEach((connection, sortedIndex) => {
    connectionPositionMap.set(connection.id, sortedIndex);
  });

  // Layout constants
  const leftX = 0;
  const gapX = 100;
  const meshX = leftX + NODE_WIDTH + gapX;
  const rightX = meshX + MESH_NODE_SIZE + gapX;
  const nodeSpacing = 70;

  // Calculate vertical centering
  const leftCount = rawGateways.length;
  const rightCount = rawConnections.length;
  const maxCount = Math.max(leftCount, rightCount, 1);
  const totalHeight = (maxCount - 1) * nodeSpacing;
  const centerStartY = -totalHeight / 2;

  const animatedDottedEdgeStyle = {
    stroke: colorScheme.edgeColor,
    strokeWidth: 1.5,
    strokeDasharray: "1 6",
    strokeLinecap: "round",
  } as const;

  // Build nodes and edges - iterate in consistent order (rawGateways/rawConnections)
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Gateway nodes (left side)
  rawGateways.forEach((gateway) => {
    const sortedIndex = gatewayPositionMap.get(gateway.id) ?? 0;
    const leftCenterStartY =
      centerStartY + ((maxCount - leftCount) * nodeSpacing) / 2;
    const centerY = leftCenterStartY + sortedIndex * nodeSpacing;
    nodes.push({
      id: `gateway-${gateway.id}`,
      type: "gateway",
      position: { x: leftX, y: centerY - GATEWAY_NODE_HEIGHT / 2 },
      data: {
        gateway,
        org: org.slug,
        metricsMode,
        metric: nodeMetrics.gateways.get(gateway.id),
        colorScheme,
      },
      draggable: false,
      selectable: false,
    });
    edges.push({
      id: `e-gateway-${gateway.id}-mesh`,
      source: `gateway-${gateway.id}`,
      target: "mesh",
      type: "smoothstep",
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: colorScheme.edgeColor,
      },
      style: animatedDottedEdgeStyle,
    });
  });

  // Mesh node (center)
  nodes.push({
    id: "mesh",
    type: "mesh",
    position: { x: meshX, y: -MESH_NODE_SIZE / 2 },
    data: {},
    draggable: false,
    selectable: false,
  });

  // Server nodes (right side)
  rawConnections.forEach((connection) => {
    const sortedIndex = connectionPositionMap.get(connection.id) ?? 0;
    const rightCenterStartY =
      centerStartY + ((maxCount - rightCount) * nodeSpacing) / 2;
    const centerY = rightCenterStartY + sortedIndex * nodeSpacing;
    nodes.push({
      id: `server-${connection.id}`,
      type: "server",
      position: { x: rightX, y: centerY - SERVER_NODE_HEIGHT / 2 },
      data: {
        connection,
        org: org.slug,
        metricsMode,
        metric: nodeMetrics.connections.get(connection.id),
        colorScheme,
      },
      draggable: false,
      selectable: false,
    });
    edges.push({
      id: `e-mesh-server-${connection.id}`,
      source: "mesh",
      target: `server-${connection.id}`,
      type: "smoothstep",
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: colorScheme.edgeColor,
      },
      style: animatedDottedEdgeStyle,
    });
  });

  // Dotted background pattern
  const dotPattern = {
    backgroundImage: `radial-gradient(circle, ${colorScheme.dotColor} 1px, transparent 1px)`,
    backgroundSize: "16px 16px",
  };

  return (
    <div
      className="w-full h-full relative mesh-minimap bg-background"
      style={dotPattern}
    >
      {/* Animate node and edge position changes on sort */}
      <style>{`
        .mesh-minimap .react-flow__node {
          transition: transform 300ms ease-out;
        }
        .mesh-minimap .react-flow__edge path {
          transition: d 300ms ease-out;
        }
      `}</style>

      {/* Metrics Mode Selector - Top Right */}
      <div className="absolute top-4 right-4 z-10">
        <MetricsModeSelector value={metricsMode} onChange={setMetricsMode} />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        panOnDrag={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent pointer-events-none"
      />
    </div>
  );
}

// ---------- Skeleton ----------

function MeshMiniMapSkeleton() {
  return (
    <div className="bg-background p-5 h-full flex items-center justify-center">
      <div className="flex items-center gap-16">
        {/* Left side skeleton */}
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 w-[220px] bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>

        {/* Center mesh skeleton */}
        <div className="h-14 w-28 bg-muted animate-pulse rounded-xl" />

        {/* Right side skeleton */}
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

// ---------- Export ----------

export function MeshMiniMap() {
  return (
    <div className={cn("bg-background h-full min-h-[420px]")}>
      <MeshMiniMapContent />
    </div>
  );
}

MeshMiniMap.Skeleton = MeshMiniMapSkeleton;
