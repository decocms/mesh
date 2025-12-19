/**
 * MeshMiniMap - A compact React Flow diagram showing gateways → MCP Mesh → servers
 *
 * Displays up to 3 gateways on the left, the central MCP Mesh node, and up to 3 MCP servers
 * on the right with arrow edges connecting them. Includes "+" buttons to create new items.
 */

import type { ConnectionEntity } from "@/tools/connection/schema";
import type { GatewayEntity } from "@/tools/gateway/schema";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import {
  useGatewayActions,
  useGateways,
} from "@/web/hooks/collections/use-gateway";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
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
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

const MAX_ITEMS = 3;

// ---------- Custom Node Types ----------

interface GatewayNodeData extends Record<string, unknown> {
  gateway: GatewayEntity;
  org: string;
}

function GatewayNode({ data }: NodeProps<Node<GatewayNodeData>>) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({
      to: "/$org/gateways/$gatewayId",
      params: { org: data.org, gatewayId: data.gateway.id },
    });
  };

  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg shadow-sm cursor-pointer hover:bg-muted/50 transition-colors min-w-[140px] nodrag nopan"
    >
      <IntegrationIcon
        icon={data.gateway.icon}
        name={data.gateway.title}
        size="xs"
        fallbackIcon="network_node"
      />
      <span className="text-xs font-medium text-foreground truncate max-w-[100px]">
        {data.gateway.title}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        className="w-2! h-2! bg-border! border-0!"
      />
    </div>
  );
}

interface ServerNodeData extends Record<string, unknown> {
  connection: ConnectionEntity;
  org: string;
}

function ServerNode({ data }: NodeProps<Node<ServerNodeData>>) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org: data.org, connectionId: data.connection.id },
    });
  };

  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg shadow-sm cursor-pointer hover:bg-muted/50 transition-colors min-w-[140px] nodrag nopan"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2! h-2! bg-border! border-0!"
      />
      <IntegrationIcon
        icon={data.connection.icon}
        name={data.connection.title}
        size="xs"
        fallbackIcon="extension"
      />
      <span className="text-xs font-medium text-foreground truncate max-w-[100px]">
        {data.connection.title}
      </span>
    </div>
  );
}

function MeshNode() {
  return (
    <div className="flex items-center justify-center px-6 py-4 bg-primary/5 border-2 border-primary/20 rounded-xl shadow-sm min-w-[120px]">
      <Handle
        type="target"
        position={Position.Left}
        className="w-2! h-2! bg-primary/40! border-0!"
      />
      <span className="text-sm font-semibold text-foreground">MCP Mesh</span>
      <Handle
        type="source"
        position={Position.Right}
        className="w-2! h-2! bg-primary/40! border-0!"
      />
    </div>
  );
}

interface AddNodeData extends Record<string, unknown> {
  side: "left" | "right";
  onAdd: () => void;
  isPending?: boolean;
}

function AddNode({ data }: NodeProps<Node<AddNodeData>>) {
  return (
    <div className="flex items-center justify-center nodrag nopan">
      {data.side === "left" && (
        <Handle
          type="source"
          position={Position.Right}
          className="w-0! h-0! opacity-0!"
        />
      )}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-md cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          data.onAdd();
        }}
        disabled={data.isPending}
      >
        {data.isPending ? (
          <Icon name="progress_activity" size={16} className="animate-spin" />
        ) : (
          <Icon name="add" size={16} />
        )}
      </Button>
      {data.side === "right" && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-0! h-0! opacity-0!"
        />
      )}
    </div>
  );
}

const nodeTypes = {
  gateway: GatewayNode,
  server: ServerNode,
  mesh: MeshNode,
  add: AddNode,
};

// ---------- Main Component ----------

function MeshMiniMapContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const gatewayActions = useGatewayActions();

  // Fetch first 3 of each
  const gateways = useGateways({ pageSize: MAX_ITEMS });
  const connections = useConnections({ pageSize: MAX_ITEMS });

  const handleCreateGateway = async () => {
    if (connections.length === 0) {
      toast.error("Create at least one MCP connection first");
      return;
    }

    const result = await gatewayActions.create.mutateAsync({
      title: "New Gateway",
      description:
        "Gateways let you securely expose integrated tools to the outside world.",
      status: "active",
      tool_selection_strategy: "passthrough",
      tool_selection_mode: "inclusion",
      connections: [],
    });

    navigate({
      to: "/$org/gateways/$gatewayId",
      params: { org: org.slug, gatewayId: result.id },
    });
  };

  const handleCreateServer = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  // Build nodes
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Layout constants
  const leftX = 0;
  const meshX = 280;
  const rightX = 560;
  const nodeSpacing = 60;

  // Calculate vertical centering
  const leftCount = gateways.length + 1; // +1 for add button
  const rightCount = connections.length + 1;
  const maxCount = Math.max(leftCount, rightCount, 1);
  const totalHeight = (maxCount - 1) * nodeSpacing;
  const startY = -totalHeight / 2;

  // Gateway nodes (left side)
  gateways.forEach((gateway, i) => {
    const leftStartY = startY + ((maxCount - leftCount) * nodeSpacing) / 2;
    nodes.push({
      id: `gateway-${gateway.id}`,
      type: "gateway",
      position: { x: leftX, y: leftStartY + i * nodeSpacing },
      data: { gateway, org: org.slug },
      draggable: false,
      selectable: false,
    });
    edges.push({
      id: `e-gateway-${gateway.id}-mesh`,
      source: `gateway-${gateway.id}`,
      target: "mesh",
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border)" },
      style: { stroke: "var(--border)", strokeWidth: 1.5 },
    });
  });

  // Add gateway button
  const leftAddY =
    startY +
    ((maxCount - leftCount) * nodeSpacing) / 2 +
    gateways.length * nodeSpacing;
  nodes.push({
    id: "add-gateway",
    type: "add",
    position: { x: leftX + 50, y: leftAddY },
    data: {
      side: "left",
      onAdd: handleCreateGateway,
      isPending: gatewayActions.create.isPending,
    },
    draggable: false,
    selectable: false,
  });

  // Mesh node (center)
  nodes.push({
    id: "mesh",
    type: "mesh",
    position: { x: meshX, y: 0 },
    data: {},
    draggable: false,
    selectable: false,
  });

  // Server nodes (right side)
  connections.forEach((connection, i) => {
    const rightStartY = startY + ((maxCount - rightCount) * nodeSpacing) / 2;
    nodes.push({
      id: `server-${connection.id}`,
      type: "server",
      position: { x: rightX, y: rightStartY + i * nodeSpacing },
      data: { connection, org: org.slug },
      draggable: false,
      selectable: false,
    });
    edges.push({
      id: `e-mesh-server-${connection.id}`,
      source: "mesh",
      target: `server-${connection.id}`,
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border)" },
      style: { stroke: "var(--border)", strokeWidth: 1.5 },
    });
  });

  // Add server button
  const rightAddY =
    startY +
    ((maxCount - rightCount) * nodeSpacing) / 2 +
    connections.length * nodeSpacing;
  nodes.push({
    id: "add-server",
    type: "add",
    position: { x: rightX + 50, y: rightAddY },
    data: {
      side: "right",
      onAdd: handleCreateServer,
    },
    draggable: false,
    selectable: false,
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
        className="bg-transparent"
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
          <div className="h-8 w-8 bg-muted animate-pulse rounded-md mx-auto" />
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
          <div className="h-8 w-8 bg-muted animate-pulse rounded-md mx-auto" />
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
