/**
 * MeshMiniMap - A compact React Flow diagram showing gateways → MCP Mesh → servers
 *
 * Displays up to 3 gateways on the left, the central MCP Mesh node, and up to 3 MCP servers
 * on the right with arrow edges connecting them.
 */

import type { ConnectionEntity } from "@/tools/connection/schema";
import type { GatewayEntity } from "@/tools/gateway/schema";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { cn } from "@deco/ui/lib/utils.ts";
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

const MAX_ITEMS = 3;
const GATEWAY_NODE_HEIGHT = 40;
const SERVER_NODE_HEIGHT = 40;
const NODE_WIDTH = 160; // tailwind w-40
const MESH_NODE_SIZE = 56; // tailwind w-14 / h-14

// ---------- Custom Node Types ----------

interface GatewayNodeData extends Record<string, unknown> {
  gateway: GatewayEntity;
  org: string;
}

function GatewayNode({ data }: NodeProps<Node<GatewayNodeData>>) {
  return (
    <div
      className="flex h-10 w-40 shrink-0 items-center justify-start gap-2 px-3 py-2 bg-background border border-border rounded-md shadow-sm nodrag nopan"
    >
      <IntegrationIcon
        icon={data.gateway.icon}
        name={data.gateway.title}
        size="xs"
        fallbackIcon="network_node"
      />
      <span className="text-xs font-normal text-foreground truncate max-w-[100px]">
        {data.gateway.title}
      </span>
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
}

function ServerNode({ data }: NodeProps<Node<ServerNodeData>>) {
  return (
    <div
      className="flex h-10 w-40 shrink-0 items-center justify-start gap-2 px-3 py-2 bg-background border border-border rounded-md shadow-sm nodrag nopan"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2! h-2! bg-transparent! border-0! opacity-0!"
      />
      <IntegrationIcon
        icon={data.connection.icon}
        name={data.connection.title}
        size="xs"
        fallbackIcon="extension"
      />
      <span className="text-xs font-normal text-foreground truncate max-w-[100px]">
        {data.connection.title}
      </span>
    </div>
  );
}

function MeshNode() {
  return (
    <div className="flex h-14 w-14 items-center justify-center p-2 bg-primary/5 border border-primary/20 rounded-lg shadow-sm">
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

// ---------- Main Component ----------

function MeshMiniMapContent() {
  const { org } = useProjectContext();

  // Fetch first 3 of each
  const gateways: GatewayEntity[] = useGateways({ pageSize: MAX_ITEMS });
  const connections: ConnectionEntity[] = useConnections({ pageSize: MAX_ITEMS });

  // Build nodes
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const animatedDottedEdgeStyle = {
    stroke: "var(--chart-1)",
    strokeWidth: 1.5,
    // Dotted look: short dash + larger gap, with rounded caps to make "dots"
    strokeDasharray: "1 6",
    strokeLinecap: "round",
  } as const;

  // Layout constants
  const leftX = 0;
  const gapX = 100;
  const meshX = leftX + NODE_WIDTH + gapX;
  const rightX = meshX + MESH_NODE_SIZE + gapX;
  const nodeSpacing = 60;

  // Calculate vertical centering
  const leftCount = gateways.length;
  const rightCount = connections.length;
  const maxCount = Math.max(leftCount, rightCount, 1);
  const totalHeight = (maxCount - 1) * nodeSpacing;
  const centerStartY = -totalHeight / 2;

  // Gateway nodes (left side)
  gateways.forEach((gateway, i) => {
    const leftCenterStartY =
      centerStartY + ((maxCount - leftCount) * nodeSpacing) / 2;
    const centerY = leftCenterStartY + i * nodeSpacing;
    nodes.push({
      id: `gateway-${gateway.id}`,
      type: "gateway",
      position: { x: leftX, y: centerY - GATEWAY_NODE_HEIGHT / 2 },
      data: { gateway, org: org.slug },
      draggable: false,
      selectable: false,
    });
    edges.push({
      id: `e-gateway-${gateway.id}-mesh`,
      source: `gateway-${gateway.id}`,
      target: "mesh",
      type: "smoothstep",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--chart-1)" },
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
  connections.forEach((connection, i) => {
    const rightCenterStartY =
      centerStartY + ((maxCount - rightCount) * nodeSpacing) / 2;
    const centerY = rightCenterStartY + i * nodeSpacing;
    nodes.push({
      id: `server-${connection.id}`,
      type: "server",
      position: { x: rightX, y: centerY - SERVER_NODE_HEIGHT / 2 },
      data: { connection, org: org.slug },
      draggable: false,
      selectable: false,
    });
    edges.push({
      id: `e-mesh-server-${connection.id}`,
      source: "mesh",
      target: `server-${connection.id}`,
      type: "smoothstep",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--chart-1)" },
      style: animatedDottedEdgeStyle,
    });
  });

  return (
    <div className="w-full h-full">
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

export function MeshMiniMapSkeleton() {
  return (
    <div className="bg-background p-5 h-full flex items-center justify-center">
      <div className="flex items-center gap-16">
        {/* Left side skeleton */}
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 w-36 bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>

        {/* Center mesh skeleton */}
        <div className="h-14 w-28 bg-muted animate-pulse rounded-xl" />

        {/* Right side skeleton */}
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 w-36 bg-muted animate-pulse rounded-lg"
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
    <div className={cn("bg-background h-[420px]")}>
      <MeshMiniMapContent />
    </div>
  );
}

MeshMiniMap.Skeleton = MeshMiniMapSkeleton;
