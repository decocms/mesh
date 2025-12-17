import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { ConnectionsPreview } from "./connections-preview.tsx";
import { MeshStats } from "./mesh-stats.tsx";
import { MonitoringHero } from "./monitoring-hero.tsx";
import { RecentActivity } from "./recent-activity.tsx";
import { TopTools } from "./top-tools.tsx";
import { BentoTile } from "./bento-tile.tsx";

export default function OrgHomePage() {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const handleAddMcp = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const handleViewStore = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  const handleViewMonitoring = () => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
    });
  };

  return (
    <CollectionPage>
      <CollectionHeader
        title={`Mesh · ${org.name}`}
        ctaButton={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3"
              onClick={handleViewStore}
            >
              <Icon name="shopping_bag" size={16} />
              Store
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3"
              onClick={handleViewMonitoring}
            >
              <Icon name="monitoring" size={16} />
              Monitoring
            </Button>
            <Button size="sm" className="h-7 px-3" onClick={handleAddMcp}>
              <Icon name="add" size={16} />
              Add MCP
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* KPI Bento */}
          <ErrorBoundary
            fallback={
              <div className="text-sm text-muted-foreground">
                Failed to load stats
              </div>
            }
          >
            <Suspense
              fallback={
                <BentoTile
                  title="Overview"
                  description="At-a-glance health for the last 24 hours"
                >
                  <MeshStats.Skeleton />
                </BentoTile>
              }
            >
              <BentoTile
                title="Overview"
                description="At-a-glance health for the last 24 hours"
              >
                <MeshStats />
              </BentoTile>
            </Suspense>
          </ErrorBoundary>

          {/* Monitoring Bento */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <ErrorBoundary
              fallback={
                <div className="text-sm text-muted-foreground">
                  Failed to load monitoring chart
                </div>
              }
            >
              <Suspense fallback={<MonitoringHero.Skeleton />}>
                <MonitoringHero />
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary
              fallback={
                <div className="text-sm text-muted-foreground">
                  Failed to load top tools
                </div>
              }
            >
              <Suspense fallback={<TopTools.Skeleton />}>
                <TopTools />
              </Suspense>
            </ErrorBoundary>
          </div>

          {/* Activity + MCP Servers */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <ErrorBoundary
              fallback={
                <div className="text-sm text-muted-foreground">
                  Failed to load recent activity
                </div>
              }
            >
              <Suspense fallback={<RecentActivity.Skeleton />}>
                <RecentActivity />
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary
              fallback={
                <div className="text-sm text-muted-foreground">
                  Failed to load connections
                </div>
              }
            >
              <Suspense fallback={<ConnectionsPreview.Skeleton />}>
                <ConnectionsPreview />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </CollectionPage>
  );
}
