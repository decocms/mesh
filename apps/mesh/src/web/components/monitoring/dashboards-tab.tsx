/**
 * Dashboards Tab Component
 *
 * Displays saved monitoring dashboards with JSONPath aggregations.
 */

import { ErrorBoundary } from "@/web/components/error-boundary";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { KEYS } from "@/web/lib/query-keys";
import {
  useMCPClient,
  useProjectContext,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Plus, BarChart07, Trash01 } from "@untitledui/icons";
import { DashboardView } from "./dashboard-view";
import { CreateDashboardModal } from "./create-dashboard-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ============================================================================
// Types
// ============================================================================

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  widgets: Array<{
    id: string;
    name: string;
    type: "metric" | "timeseries" | "table";
  }>;
  createdAt: string;
}

interface DashboardListResponse {
  dashboards: Dashboard[];
  total: number;
}

// ============================================================================
// Dashboard List Content
// ============================================================================

function DashboardListContent() {
  const { org, locator } = useProjectContext();
  const queryClient = useQueryClient();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(
    null,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data } = useSuspenseQuery({
    queryKey: KEYS.monitoringDashboards(locator),
    queryFn: async () => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: "MONITORING_DASHBOARD_LIST",
        arguments: {},
      })) as { structuredContent?: DashboardListResponse };
      return (result.structuredContent ?? result) as DashboardListResponse;
    },
  });

  const dashboards = data?.dashboards ?? [];

  const handleDelete = async (id: string) => {
    if (!client) return;
    setIsDeleting(true);
    try {
      await client.callTool({
        name: "MONITORING_DASHBOARD_DELETE",
        arguments: { id },
      });
      toast.success("Dashboard deleted");
      queryClient.invalidateQueries({
        queryKey: KEYS.monitoringDashboards(locator),
      });
      if (selectedDashboardId === id) {
        setSelectedDashboardId(null);
      }
    } catch (error) {
      toast.error("Failed to delete dashboard");
      console.error(error);
    } finally {
      setIsDeleting(false);
      setDeleteDialogId(null);
    }
  };

  // If a dashboard is selected, show its view
  if (selectedDashboardId) {
    return (
      <DashboardView
        dashboardId={selectedDashboardId}
        onBack={() => setSelectedDashboardId(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Custom Dashboards</h2>
          <p className="text-sm text-muted-foreground">
            Create dashboards with JSONPath aggregations to visualize your
            monitoring data
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} size="sm">
          <Plus size={16} className="mr-1.5" />
          New Dashboard
        </Button>
      </div>

      {/* Dashboard Grid */}
      {dashboards.length === 0 ? (
        <EmptyState
          title="No dashboards yet"
          description="Create a dashboard to aggregate and visualize your monitoring data"
          image={<BarChart07 size={48} className="text-muted-foreground/50" />}
          actions={
            <Button onClick={() => setIsCreateModalOpen(true)} size="sm">
              <Plus size={16} className="mr-1.5" />
              Create Dashboard
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map((dashboard) => (
            <div
              key={dashboard.id}
              className="group border rounded-lg p-4 hover:border-primary/50 cursor-pointer transition-colors bg-card"
              onClick={() => setSelectedDashboardId(dashboard.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart07
                    size={18}
                    className="text-muted-foreground shrink-0"
                  />
                  <h3 className="font-medium truncate">{dashboard.name}</h3>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialogId(dashboard.id);
                    }}
                  >
                    <Trash01 size={14} />
                  </Button>
                </div>
              </div>
              {dashboard.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {dashboard.description}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{dashboard.widgets.length} widgets</span>
                <span>•</span>
                <span>
                  Created {new Date(dashboard.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dashboard Modal */}
      <CreateDashboardModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreated={(id) => {
          setIsCreateModalOpen(false);
          setSelectedDashboardId(id);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteDialogId}
        onOpenChange={() => setDeleteDialogId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dashboard</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this dashboard? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => deleteDialogId && handleDelete(deleteDialogId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function DashboardsTabSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-auto p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-40 bg-muted rounded animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="h-5 w-32 bg-muted rounded animate-pulse mb-2" />
            <div className="h-4 w-full bg-muted rounded animate-pulse mb-3" />
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Export
// ============================================================================

export function DashboardsTab() {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Failed to load dashboards
        </div>
      }
    >
      <Suspense fallback={<DashboardsTabSkeleton />}>
        <DashboardListContent />
      </Suspense>
    </ErrorBoundary>
  );
}
