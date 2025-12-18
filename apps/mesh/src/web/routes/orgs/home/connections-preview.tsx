import { EmptyState } from "@/web/components/empty-state.tsx";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@deco/ui/components/icon.tsx";
import { BentoTile } from "./bento-tile";

const MAX_LISTED_CONNECTIONS = 4;

function ConnectionsPreviewContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const connections = useConnections() ?? [];

  // Show up to MAX_LISTED_CONNECTIONS connections, prioritizing active ones
  const sortedConnections = [...connections].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return 0;
  });
  const previewConnections = sortedConnections.slice(0, MAX_LISTED_CONNECTIONS);

  const handleCardClick = (connectionId: string) => {
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org: org.slug, connectionId },
    });
  };

  const handleViewAll = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
    });
  };

  if (connections.length === 0) {
    return (
      <BentoTile
        title={
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-accent text-foreground">
              <Icon name="hub" size={16} />
            </span>
            Your MCP Servers
          </div>
        }
        description="Connect MCP servers to power your Mesh"
        className="lg:col-span-2"
      >
        <EmptyState
          image={
            <img
              src="/emptystate-mcp.svg"
              alt=""
              width={500}
              height={223}
              aria-hidden="true"
            />
          }
          title="No MCPs found"
          description="Create a connection to get started, or browse the store to install one."
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  navigate({
                    to: "/$org/mcps",
                    params: { org: org.slug },
                    search: { action: "create" },
                  })
                }
                className="text-sm text-primary hover:underline"
              >
                Add MCP
              </button>
              <span className="text-muted-foreground">or</span>
              <button
                onClick={() =>
                  navigate({
                    to: "/$org/store",
                    params: { org: org.slug },
                  })
                }
                className="text-sm text-primary hover:underline"
              >
                Browse Store
              </button>
            </div>
          }
        />
      </BentoTile>
    );
  }

  return (
    <BentoTile
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="grid_view" size={16} />
          </span>
          Your MCP Servers
        </div>
      }
      description="A quick view of your connected MCP servers"
      className="lg:col-span-2"
      action={
        connections.length > previewConnections.length ? (
          <Button variant="ghost" size="sm" onClick={handleViewAll}>
            View all ({connections.length})
            <Icon name="chevron_right" size={16} />
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4">
        {previewConnections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            onClick={() => handleCardClick(connection.id)}
            size="sm"
          />
        ))}
      </div>
    </BentoTile>
  );
}

function ConnectionsPreviewSkeleton() {
  return (
    <BentoTile
      title="Your MCP Servers"
      description="A quick view of your connected MCP servers"
      className="lg:col-span-2"
      action={<div className="h-7 w-28 rounded bg-muted animate-pulse" />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/60 bg-background p-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 bg-muted rounded animate-pulse" />
                <div className="h-5 w-16 bg-muted rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full bg-muted rounded animate-pulse" />
                <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </BentoTile>
  );
}

export const ConnectionsPreview = Object.assign(ConnectionsPreviewContent, {
  Skeleton: ConnectionsPreviewSkeleton,
});
