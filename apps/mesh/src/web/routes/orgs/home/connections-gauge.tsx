import { EmptyState } from "@/web/components/empty-state.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
import { HomeGauge } from "./home-gauge.tsx";
import { HomeGridCell } from "./home-grid-cell.tsx";

function ConnectionsGaugeContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const connections = useConnections() ?? [];

  const totalConnections = connections.length;
  const firstThreeConnections = connections.slice(0, 3);

  const handleGoToConnections = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const handleViewAllConnections = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
    });
  };

  const handleConnectionClick = (connectionId: string) => {
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org: org.slug, connectionId },
    });
  };

  if (totalConnections === 0) {
    return (
      <HomeGridCell
        title={
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg">
              <Icon name="hub" size={16} />
            </span>
            Connections
          </div>
        }
        description="MCP server connections"
      >
        <EmptyState
          image={null}
          title="No connections yet"
          description="Create your first MCP connection to get started."
          actions={
            <button
              onClick={handleGoToConnections}
              className="text-sm text-primary hover:underline"
            >
              Add Connection
            </button>
          }
        />
      </HomeGridCell>
    );
  }

  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="grid_view" size={16} />
          </span>
          MCP Servers
        </div>
      }
      description="MCP server connections"
      action={
        <Button variant="ghost" size="sm" onClick={handleViewAllConnections}>
          View all
          <Icon name="chevron_right" size={16} />
        </Button>
      }
    >
      <div className="flex items-center gap-6 w-full">
        {/* Left: Gauge */}
        <div className="flex-shrink-0">
          <HomeGauge value={totalConnections} label="connections" />
        </div>

        {/* Right: List of first 3 connections */}
        {firstThreeConnections.length > 0 && (
          <div className="flex-1 min-w-0 space-y-2">
            {firstThreeConnections.map((connection) => (
              <button
                key={connection.id}
                type="button"
                onClick={() => handleConnectionClick(connection.id)}
                className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 hover:bg-muted/40 transition-colors text-left"
              >
                {connection.icon ? (
                  <img
                    src={connection.icon}
                    alt=""
                    className="size-8 rounded shrink-0"
                  />
                ) : (
                  <div className="size-8 rounded bg-muted flex items-center justify-center shrink-0">
                    <Icon name="hub" size={16} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {connection.title}
                  </div>
                  {connection.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {connection.description}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </HomeGridCell>
  );
}

function ConnectionsGaugeSkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="hub" size={16} />
          </span>
          Connections
        </div>
      }
      description="MCP server connections"
    >
      <div className="flex items-center gap-6 w-full">
        <div className="h-[180px] w-[180px] rounded-full bg-muted animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    </HomeGridCell>
  );
}

export const ConnectionsGauge = Object.assign(ConnectionsGaugeContent, {
  Skeleton: ConnectionsGaugeSkeleton,
});
