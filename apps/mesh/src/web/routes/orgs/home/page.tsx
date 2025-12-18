import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { ConnectionsGauge } from "./connections-gauge.tsx";
import { MembersGauge } from "./members-gauge.tsx";
import { MonitoringKPIs } from "./monitoring-kpis.tsx";
import { RecentActivity } from "./recent-activity.tsx";
import { TopTools } from "./top-tools.tsx";

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
        title={org.name}
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
              Connect MCP
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-7xl mx-auto">
          {/* Grid with internal dividers only */}
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-px bg-border">
            {/* Row 1: 3 KPI bar charts */}
            <div className="lg:col-span-2">
              <ErrorBoundary
                fallback={
                  <div className="bg-background p-5 text-sm text-muted-foreground">
                    Failed to load tool calls
                  </div>
                }
              >
                <Suspense fallback={<MonitoringKPIs.ToolCalls.Skeleton />}>
                  <MonitoringKPIs.ToolCalls />
                </Suspense>
              </ErrorBoundary>
            </div>

            <div className="lg:col-span-2">
              <ErrorBoundary
                fallback={
                  <div className="bg-background p-5 text-sm text-muted-foreground">
                    Failed to load error rate
                  </div>
                }
              >
                <Suspense fallback={<MonitoringKPIs.ErrorRate.Skeleton />}>
                  <MonitoringKPIs.ErrorRate />
                </Suspense>
              </ErrorBoundary>
            </div>

            <div className="lg:col-span-2">
              <ErrorBoundary
                fallback={
                  <div className="bg-background p-5 text-sm text-muted-foreground">
                    Failed to load latency
                  </div>
                }
              >
                <Suspense fallback={<MonitoringKPIs.Latency.Skeleton />}>
                  <MonitoringKPIs.Latency />
                </Suspense>
              </ErrorBoundary>
            </div>

            {/* Row 2: 2 gauges */}
            <div className="lg:col-span-3">
              <ErrorBoundary
                fallback={
                  <div className="bg-background p-5 text-sm text-muted-foreground">
                    Failed to load members
                  </div>
                }
              >
                <Suspense fallback={<MembersGauge.Skeleton />}>
                  <MembersGauge />
                </Suspense>
              </ErrorBoundary>
            </div>

            <div className="lg:col-span-3">
              <ErrorBoundary
                fallback={
                  <div className="bg-background p-5 text-sm text-muted-foreground">
                    Failed to load connections
                  </div>
                }
              >
                <Suspense fallback={<ConnectionsGauge.Skeleton />}>
                  <ConnectionsGauge />
                </Suspense>
              </ErrorBoundary>
            </div>

            {/* Row 3: Recent Activity + Top Tools */}
            <div className="lg:col-span-3">
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

            <div className="lg:col-span-3">
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
      </div>
    </CollectionPage>
  );
}
