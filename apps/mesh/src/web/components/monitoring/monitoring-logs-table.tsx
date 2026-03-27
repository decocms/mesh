/**
 * Monitoring Logs Table
 *
 * Table component for displaying monitoring log entries with infinite scroll.
 * Clicking a row opens a detail drawer on the right side.
 * Supports mock data when USE_MOCK_DATA is enabled.
 */

import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { LogRow } from "@/web/components/monitoring/log-row.tsx";
import { ExpandedLogContent } from "@/web/components/monitoring/types.tsx";
import type {
  EnrichedMonitoringLog,
  MonitoringLogsResponse,
  MonitoringSearchParams,
} from "@/web/components/monitoring";
import { useInfiniteScroll } from "@/web/hooks/use-infinite-scroll.ts";
import { useMembers } from "@/web/hooks/use-members";
import { KEYS } from "@/web/lib/query-keys";
import {
  useConnections,
  useMCPClient,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import { Badge } from "@deco/ui/components/badge.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@deco/ui/components/sheet.tsx";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@deco/ui/components/table.tsx";
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { USE_MOCK_DATA, getMockLogs } from "./mock-data.ts";

// ============================================================================
// Types
// ============================================================================

interface MonitoringLogsTableProps {
  connectionIds: string[];
  virtualMcpIds: string[];
  tool: string;
  status: string;
  search: string;
  logs: MonitoringLogsResponse["logs"];
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  connections: ReturnType<typeof useConnections>;
  virtualMcps: ReturnType<typeof useVirtualMCPs>;
  membersData: ReturnType<typeof useMembers>["data"];
}

// ============================================================================
// Log Detail Drawer
// ============================================================================

function LogDetailDrawer({
  log,
  open,
  onOpenChange,
}: {
  log: EnrichedMonitoringLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!log) return null;

  const timestamp = new Date(log.timestamp);
  const dateStr = timestamp.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = timestamp.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-2xl w-full overflow-y-auto p-0"
      >
        {/* Header: tool name + status */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border space-y-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold truncate">
                {log.toolName}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {log.connectionTitle}
              </p>
            </div>
            <Badge
              variant={log.isError ? "destructive" : "success"}
              className="text-xs shrink-0"
            >
              {log.isError ? "Error" : "Success"}
            </Badge>
          </div>
        </SheetHeader>

        {/* Metadata grid */}
        <div className="px-6 py-5 border-b border-border">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Timestamp
              </p>
              <p className="text-sm text-foreground">
                {dateStr}, {timeStr}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Duration
              </p>
              <p className="text-sm text-foreground font-mono">
                {log.durationMs >= 1000
                  ? `${(log.durationMs / 1000).toFixed(2)}s`
                  : `${log.durationMs}ms`}
              </p>
            </div>
            {log.virtualMcpName && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Agent
                </p>
                <p className="text-sm text-foreground">{log.virtualMcpName}</p>
              </div>
            )}
            {log.userName && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  User
                </p>
                <p className="text-sm text-foreground">{log.userName}</p>
              </div>
            )}
          </div>
        </div>

        {/* Full expanded content (input/output, properties, etc.) */}
        <ExpandedLogContent log={log} />
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Logs Table Content
// ============================================================================

function MonitoringLogsTableContent({
  connectionIds,
  virtualMcpIds,
  tool,
  status,
  search: searchQuery,
  logs,
  hasMore,
  onLoadMore,
  isLoadingMore,
  connections: connectionsData,
  virtualMcps: virtualMcpsData,
  membersData,
}: MonitoringLogsTableProps) {
  const connections = connectionsData ?? [];
  const virtualMcps = virtualMcpsData ?? [];
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Use the infinite scroll hook with loading guard
  const lastLogRef = useInfiniteScroll(onLoadMore, hasMore, isLoadingMore);

  const members = membersData?.data?.members ?? [];
  const userMap = new Map(members.map((m) => [m.userId, m.user]));

  // Create virtual MCP lookup map
  const virtualMcpMap = new Map(virtualMcps.map((vm) => [vm.id, vm]));

  const enrichedLogs: EnrichedMonitoringLog[] = logs.map((log) => {
    const user = userMap.get(log.userId ?? "");
    const virtualMcp = log.virtualMcpId
      ? virtualMcpMap.get(log.virtualMcpId)
      : null;
    return {
      ...log,
      userName: user?.name ?? log.userId ?? "Unknown",
      userImage: user?.image,
      virtualMcpName: virtualMcp?.title ?? null,
    };
  });

  // Filter logs by search query (client-side text search only;
  // connection and virtual MCP filtering is handled server-side)
  let filteredLogs = enrichedLogs;

  // Filter by search query
  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    filteredLogs = filteredLogs.filter(
      (log) =>
        log.toolName.toLowerCase().includes(lowerQuery) ||
        log.connectionTitle.toLowerCase().includes(lowerQuery) ||
        log.errorMessage?.toLowerCase().includes(lowerQuery),
    );
  }

  // Get connection info
  const connectionMap = new Map(connections.map((c) => [c.id, c]));

  const selectedLog = filteredLogs.find((l) => l.id === selectedLogId) ?? null;

  if (filteredLogs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          image={
            <img
              src="/empty-state-logs.svg"
              alt=""
              width={336}
              height={320}
              aria-hidden="true"
            />
          }
          title="No logs found"
          description={
            searchQuery ||
            connectionIds.length > 0 ||
            virtualMcpIds.length > 0 ||
            tool ||
            status !== "all"
              ? "No logs match your filters"
              : "No logs found in this time range"
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex-1 overflow-auto min-w-0">
        <div className="min-w-[600px] md:min-w-0 bg-background">
          <Table className="w-full border-collapse">
            <TableHeader className="border-b-0 z-20">
              <TableRow className="h-9 hover:bg-transparent border-b border-border">
                {/* Connection Icon Column */}
                <TableHead className="w-12 md:w-16 px-2 md:px-4" />

                {/* Tool/Connection Column */}
                <TableHead className="pr-2 md:pr-4 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
                  Tool / Connection
                </TableHead>

                {/* Agent Column */}
                <TableHead className="w-24 md:w-32 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
                  Agent
                </TableHead>

                {/* Date Column */}
                <TableHead className="w-20 md:w-24 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
                  Date
                </TableHead>

                {/* Status Column */}
                <TableHead className="w-16 md:w-20 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
                  Status
                </TableHead>

                {/* Duration Column */}
                <TableHead className="w-16 md:w-20 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide text-right pr-3 md:pr-5">
                  Latency
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log, index) => (
                <LogRow
                  key={log.id}
                  log={log}
                  isSelected={log.id === selectedLogId}
                  connection={connectionMap.get(log.connectionId)}
                  virtualMcpName={log.virtualMcpName ?? ""}
                  onSelect={() => setSelectedLogId(log.id)}
                  lastLogRef={
                    index === filteredLogs.length - 1 ? lastLogRef : undefined
                  }
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Log Detail Drawer */}
      <LogDetailDrawer
        log={selectedLog}
        open={selectedLogId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLogId(null);
        }}
      />
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function MonitoringLogsTableSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex-1 overflow-auto min-w-0">
        <div className="min-w-[600px] md:min-w-0 bg-background">
          <Table className="w-full border-collapse">
            <TableHeader className="border-b-0 z-20">
              <TableRow className="h-9 hover:bg-transparent border-b border-border">
                <TableHead className="w-12 md:w-16 px-2 md:px-4" />
                <TableHead className="pr-2 md:pr-4">
                  <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                </TableHead>
                <TableHead className="w-24 md:w-32 px-2 md:px-3">
                  <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                </TableHead>
                <TableHead className="w-20 md:w-24 px-2 md:px-3">
                  <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                </TableHead>
                <TableHead className="w-16 md:w-20 px-2 md:px-3">
                  <div className="h-3 w-12 rounded bg-muted animate-pulse" />
                </TableHead>
                <TableHead className="w-16 md:w-20 px-2 md:px-3 pr-3 md:pr-5">
                  <div className="h-3 w-10 rounded bg-muted animate-pulse ml-auto" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="h-14 border-b border-border">
                  <td className="px-2 md:px-4">
                    <div className="size-6 rounded bg-muted animate-pulse" />
                  </td>
                  <td className="pr-2 md:pr-4">
                    <div className="space-y-1">
                      <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
                      <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
                    </div>
                  </td>
                  <td className="px-2 md:px-3">
                    <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                  </td>
                  <td className="px-2 md:px-3">
                    <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                  </td>
                  <td className="px-2 md:px-3">
                    <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
                  </td>
                  <td className="px-2 md:px-3 pr-3 md:pr-5">
                    <div className="h-3 w-10 rounded bg-muted animate-pulse ml-auto" />
                  </td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export const MonitoringLogsTable = Object.assign(MonitoringLogsTableContent, {
  Skeleton: MonitoringLogsTableSkeleton,
});

// ============================================================================
// AuditTabContent
// ============================================================================

export interface AuditTabContentProps {
  client: ReturnType<typeof useMCPClient>;
  locator: ReturnType<typeof useProjectContext>["locator"];
  baseParams: Record<string, unknown>;
  pageSize: number;
  isStreaming: boolean;
  streamingRefetchInterval: number;
  connectionIds: string[];
  virtualMcpIds: string[];
  tool: string;
  status: string;
  searchQuery: string;
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
  allConnections: ReturnType<typeof useConnections>;
  allVirtualMcps: ReturnType<typeof useVirtualMCPs>;
  membersData: ReturnType<typeof useMembers>["data"];
}

export function AuditTabContent({
  client,
  locator,
  baseParams,
  pageSize,
  isStreaming,
  streamingRefetchInterval,
  connectionIds,
  virtualMcpIds,
  tool,
  status,
  searchQuery,
  onUpdateFilters,
  allConnections,
  allVirtualMcps,
  membersData,
}: AuditTabContentProps) {
  // Mock data path
  if (USE_MOCK_DATA) {
    return (
      <MockAuditTabContent
        baseParams={baseParams}
        pageSize={pageSize}
        connectionIds={connectionIds}
        virtualMcpIds={virtualMcpIds}
        tool={tool}
        status={status}
        searchQuery={searchQuery}
        onUpdateFilters={onUpdateFilters}
        allConnections={allConnections}
        allVirtualMcps={allVirtualMcps}
        membersData={membersData}
      />
    );
  }

  return (
    <RealAuditTabContent
      client={client}
      locator={locator}
      baseParams={baseParams}
      pageSize={pageSize}
      isStreaming={isStreaming}
      streamingRefetchInterval={streamingRefetchInterval}
      connectionIds={connectionIds}
      virtualMcpIds={virtualMcpIds}
      tool={tool}
      status={status}
      searchQuery={searchQuery}
      onUpdateFilters={onUpdateFilters}
      allConnections={allConnections}
      allVirtualMcps={allVirtualMcps}
      membersData={membersData}
    />
  );
}

// ============================================================================
// Mock Audit Tab
// ============================================================================

function MockAuditTabContent({
  baseParams,
  pageSize,
  connectionIds,
  virtualMcpIds,
  tool,
  status,
  searchQuery,
  onUpdateFilters,
  allConnections,
  allVirtualMcps,
  membersData,
}: Omit<
  AuditTabContentProps,
  "client" | "locator" | "isStreaming" | "streamingRefetchInterval"
>) {
  const { data } = useSuspenseQuery({
    queryKey: ["mock", "logs", JSON.stringify(baseParams)],
    queryFn: () =>
      Promise.resolve(
        getMockLogs({
          startDate: baseParams.startDate as string,
          endDate: baseParams.endDate as string,
          limit: pageSize,
          offset: 0,
        }),
      ),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div className="flex-1 flex flex-col overflow-auto md:overflow-hidden min-w-0">
      <CollectionSearch
        value={searchQuery}
        onChange={(value) => onUpdateFilters({ search: value })}
        placeholder="Search by tool name, connection, or error..."
        className="border-t"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onUpdateFilters({ search: "" });
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MonitoringLogsTable
          connectionIds={connectionIds}
          virtualMcpIds={virtualMcpIds}
          tool={tool}
          status={status}
          search={searchQuery}
          logs={data.logs}
          hasMore={false}
          onLoadMore={() => {}}
          isLoadingMore={false}
          connections={allConnections}
          virtualMcps={allVirtualMcps}
          membersData={membersData}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Real Audit Tab (server data)
// ============================================================================

function RealAuditTabContent({
  client,
  locator,
  baseParams,
  pageSize,
  isStreaming,
  streamingRefetchInterval,
  connectionIds,
  virtualMcpIds,
  tool,
  status,
  searchQuery,
  onUpdateFilters,
  allConnections,
  allVirtualMcps,
  membersData,
}: AuditTabContentProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery({
      queryKey: KEYS.monitoringLogsInfinite(
        locator,
        JSON.stringify(baseParams),
      ),
      queryFn: async ({ pageParam = 0 }) => {
        if (!client) {
          throw new Error("MCP client is not available");
        }
        const result = (await client.callTool({
          name: "MONITORING_LOGS_LIST",
          arguments: {
            ...baseParams,
            limit: pageSize,
            offset: pageParam,
          },
        })) as { structuredContent?: unknown };
        return (result.structuredContent ?? result) as MonitoringLogsResponse;
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        if ((lastPage?.logs?.length ?? 0) < pageSize) {
          return undefined;
        }
        return allPages.length * pageSize;
      },
      staleTime: 0,
      refetchInterval: isStreaming ? streamingRefetchInterval : false,
    });

  const allLogs = data.pages.flatMap((page) => page.logs ?? []);

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-auto md:overflow-hidden min-w-0">
      <CollectionSearch
        value={searchQuery}
        onChange={(value) => onUpdateFilters({ search: value })}
        placeholder="Search by tool name, connection, or error..."
        className="border-t"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onUpdateFilters({ search: "" });
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MonitoringLogsTable
          connectionIds={connectionIds}
          virtualMcpIds={virtualMcpIds}
          tool={tool}
          status={status}
          search={searchQuery}
          logs={allLogs}
          hasMore={hasNextPage ?? false}
          onLoadMore={handleLoadMore}
          isLoadingMore={isFetchingNextPage}
          connections={allConnections}
          virtualMcps={allVirtualMcps}
          membersData={membersData}
        />
      </div>
    </div>
  );
}
