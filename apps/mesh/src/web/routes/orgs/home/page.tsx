import { createToolCaller } from "@/tools/client";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { MonitoringKPIs } from "./monitoring-kpis.tsx";
import { RecentActivity } from "./recent-activity.tsx";
import { TopTools } from "./top-tools.tsx";

interface MonitoringStats {
  totalCalls: number;
  errorRate: number;
  avgDurationMs: number;
  errorRatePercent: string;
}

function WelcomeOverlay() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: stats } = useToolCall<
    { startDate: string; endDate: string },
    MonitoringStats
  >({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: dateRange,
    scope: locator,
    staleTime: 60_000,
  });

  const hasActivity = (stats?.totalCalls ?? 0) > 0;

  const handleAddMcp = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const handleBrowseStore = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  if (hasActivity) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 bg-background/80 backdrop-blur-[3px] z-10">
      <div className="max-w-md w-full bg-background rounded-xl border border-border shadow-lg pointer-events-auto overflow-hidden">
        {/* Illustration Section */}
        <div className="p-2">
          <div className="bg-muted border border-border rounded-lg h-[250px] overflow-hidden relative flex items-center justify-center">
            <img
              src="/empty-state-home.png"
              alt="MCP Mesh illustration"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Content Section */}
        <div className="px-6 py-6 space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Welcome to your MCP Mesh
          </h2>
          <p className="text-sm text-muted-foreground leading-normal">
            Connect your first MCP server to unlock real-time metrics, activity
            logs, and analytics right here on your home.
          </p>
        </div>

        {/* Actions Section */}
        <div className="border-t border-border px-4 py-4 flex items-center justify-center gap-2">
          <Button onClick={handleBrowseStore} size="sm" className="h-9">
            <Icon name="shopping_bag" size={16} />
            Browse Store
          </Button>
          <Button
            variant="outline"
            onClick={handleAddMcp}
            size="sm"
            className="h-9"
          >
            <Icon name="add" size={16} />
            Connect MCP Server
          </Button>
        </div>
      </div>
    </div>
  );
}

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

  return (
    <CollectionPage>
      <CollectionHeader
        title={org.name}
        ctaButton={
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3"
            onClick={handleAddMcp}
          >
            <Icon name="add" size={16} />
            Connect MCP Server
          </Button>
        }
      />

      <div className="flex-1 overflow-auto relative">
        <div className="h-full">
          {/* Grid with internal dividers only */}
          <div className="grid grid-cols-1 lg:grid-cols-6 lg:grid-rows-[auto_1fr] gap-[0.5px] bg-border h-full">
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

            {/* Row 2: Recent Activity + Top Tools */}
            <div className="lg:col-span-3 min-h-0 overflow-hidden">
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

            <div className="lg:col-span-3 min-h-0 overflow-hidden">
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

          <WelcomeOverlay />
        </div>
      </div>
    </CollectionPage>
  );
}
