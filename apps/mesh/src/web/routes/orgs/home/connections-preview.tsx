import { EmptyState } from "@/web/components/empty-state.tsx";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@deco/ui/components/card.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";

function ConnectionsPreviewContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const connections = useConnections() ?? [];

  // Show up to 8 connections, prioritizing active ones
  const sortedConnections = [...connections].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return 0;
  });
  const previewConnections = sortedConnections.slice(0, 8);

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
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-foreground">Your MCPs</h2>
        </div>
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
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-foreground">Your MCPs</h2>
        {connections.length > previewConnections.length && (
          <button
            onClick={handleViewAll}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View all ({connections.length})
            <Icon name="chevron_right" size={16} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {previewConnections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            onClick={() => handleCardClick(connection.id)}
            size="sm"
          />
        ))}
      </div>
    </Card>
  );
}

function ConnectionsPreviewSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-24 bg-muted rounded animate-pulse" />
        <div className="h-4 w-20 bg-muted rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
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
          </Card>
        ))}
      </div>
    </Card>
  );
}

export const ConnectionsPreview = Object.assign(ConnectionsPreviewContent, {
  Skeleton: ConnectionsPreviewSkeleton,
});
