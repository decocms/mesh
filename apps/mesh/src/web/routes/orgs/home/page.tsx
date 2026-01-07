/**
 * Organization Home Page
 *
 * Displays either a mesh visualization (graph view) or dashboard view
 * with KPIs, recent activity, and top tools.
 */

import { createToolCaller } from "@/tools/client";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import { Button } from "@deco/ui/components/button.tsx";
import { ViewModeToggle } from "@deco/ui/components/view-mode-toggle.tsx";
import {
  ShoppingBag01,
  Plus,
  BarChart01,
  GitBranch01,
} from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import {
  MeshVisualization,
  MeshVisualizationSkeleton,
  type MetricsMode,
} from "./mesh-graph.tsx";
import { MonitoringKPIs } from "./monitoring-kpis.tsx";
import {
  hasMonitoringActivity,
  type MonitoringStats,
} from "@/web/components/monitoring";
import { RecentActivity } from "./recent-activity.tsx";
import { TopGateways } from "./top-gateways.tsx";
import { TopServers } from "./top-servers.tsx";
import { TopTools } from "./top-tools.tsx";

// ============================================================================
// Types
// ============================================================================

type ViewMode = "graph" | "dashboard";

// ============================================================================
// Welcome Overlay
// ============================================================================

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
    refetchInterval: (query) =>
      hasMonitoringActivity(query.state.data) ? false : 1_000,
  });

  if (hasMonitoringActivity(stats)) return null;

  const handleAddMcp = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const handleBrowseStore = () => {
    navigate({ to: "/$org/store", params: { org: org.slug } });
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 bg-background/80 backdrop-blur-[3px] z-10">
      <div className="max-w-md w-full bg-background rounded-xl border border-border shadow-lg pointer-events-auto overflow-hidden">
        <div className="p-2">
          <div className="bg-muted border border-border rounded-lg h-[250px] overflow-hidden flex items-center justify-center">
            <img
              src="/empty-state-home.png"
              alt="MCP Mesh illustration"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="px-6 py-6 space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Welcome to your MCP Mesh
          </h2>
          <p className="text-sm text-muted-foreground leading-normal">
            Connect your first Connection to unlock real-time metrics, activity
            logs, and analytics right here on your home.
          </p>
        </div>

        <div className="border-t border-border px-4 py-4 flex items-center justify-center gap-2">
          <Button onClick={handleBrowseStore} size="default">
            <ShoppingBag01 size={16} />
            Browse Store
          </Button>
          <Button variant="outline" onClick={handleAddMcp} size="default">
            <Plus size={16} />
            Create Connection
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard View
// ============================================================================

function DashboardView({
  metricsMode,
  onMetricsModeChange,
}: {
  metricsMode: MetricsMode;
  onMetricsModeChange: (mode: MetricsMode) => void;
}) {
  return (
    <div className="w-full">
      {/* Grid with internal dividers only */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[0.5px] bg-border">
        {/* Row 1: 3 KPI bar charts */}
        <div className="lg:col-span-2">
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load monitoring stats
              </div>
            }
          >
            <Suspense fallback={<MonitoringKPIs.Skeleton />}>
              <MonitoringKPIs.Content />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Left: Recent Activity - uses CSS Grid subgrid to match right column height */}
        <div className="lg:col-span-1 lg:row-span-3 bg-background grid">
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load recent activity
              </div>
            }
          >
            <Suspense fallback={<RecentActivity.Skeleton />}>
              <RecentActivity.Content />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Top Tools */}
        <div className="lg:col-span-1 lg:row-span-1 bg-background">
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load top tools
              </div>
            }
          >
            <Suspense fallback={<TopTools.Skeleton />}>
              <TopTools.Content metricsMode={metricsMode} />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Connections */}
        <div className="lg:col-span-1 lg:row-span-1 bg-background">
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load top servers
              </div>
            }
          >
            <Suspense fallback={<TopServers.Skeleton />}>
              <TopServers.Content
                metricsMode={metricsMode}
                onMetricsModeChange={onMetricsModeChange}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Hubs */}
        <div className="lg:col-span-1 lg:row-span-1 bg-background">
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load top gateways
              </div>
            }
          >
            <Suspense fallback={<TopGateways.Skeleton />}>
              <TopGateways.Content metricsMode={metricsMode} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function OrgHomePage() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem("org-home-view-mode");
    return stored === "dashboard" || stored === "graph" ? stored : "dashboard";
  });

  const [metricsMode, setMetricsMode] = useState<MetricsMode>("requests");

  // Check if there's monitoring activity to show/hide controls
  const { data: stats } = useToolCall<
    { startDate: string; endDate: string },
    MonitoringStats
  >({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: dateRange,
    scope: locator,
    staleTime: 60_000,
    refetchInterval: (query) =>
      hasMonitoringActivity(query.state.data) ? false : 1_000,
  });

  const showControls = hasMonitoringActivity(stats);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("org-home-view-mode", mode);
  };

  const handleAddMcp = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  return (
    <CollectionPage>
      <WelcomeOverlay />

      <CollectionHeader
        title={org.name}
        ctaButton={
          <div className="flex items-center gap-2">
            {showControls && (
              <ViewModeToggle
                value={viewMode}
                onValueChange={handleViewModeChange}
                size="sm"
                options={[
                  { value: "dashboard", icon: <BarChart01 /> },
                  { value: "graph", icon: <GitBranch01 /> },
                ]}
              />
            )}
            <Button variant="outline" size="sm" onClick={handleAddMcp}>
              <Plus size={16} />
              Connect MCP Server
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto relative">
        {viewMode === "graph" ? (
          <ErrorBoundary
            fallback={
              <div className="bg-background p-5 text-sm text-muted-foreground h-full flex items-center justify-center">
                Failed to load mesh visualization
              </div>
            }
          >
            <Suspense fallback={<MeshVisualizationSkeleton />}>
              <MeshVisualization showControls={showControls} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <DashboardView
            metricsMode={metricsMode}
            onMetricsModeChange={setMetricsMode}
          />
        )}
      </div>
    </CollectionPage>
  );
}
