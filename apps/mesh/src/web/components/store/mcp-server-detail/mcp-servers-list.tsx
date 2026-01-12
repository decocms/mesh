import { useState, useMemo } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Plus, Server01, Globe02, Terminal } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";

type Protocol = "http" | "sse" | "stdio";

interface RemoteServer {
  index: number;
  hostname: string;
  url?: string;
  name?: string;
  title?: string;
  description?: string;
  protocols: Protocol[];
}

interface MCPServersListProps {
  remotes: Array<{
    type?: string;
    url?: string;
    name?: string;
    title?: string;
    description?: string;
  }>;
  onInstall: (remoteIndex: number) => void;
  isInstalling?: boolean;
}

/**
 * Extract hostname from URL
 */
function getHostname(url?: string): string {
  if (!url) return "Unknown";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Normalize remote type to protocol
 */
function normalizeProtocol(type?: string): Protocol {
  if (!type) return "http";
  const lower = type.toLowerCase();
  if (lower === "sse") return "sse";
  if (lower === "stdio") return "stdio";
  return "http";
}

/**
 * Get icon for protocol
 */
function ProtocolIcon({
  protocol,
  className,
}: {
  protocol: Protocol;
  className?: string;
}) {
  switch (protocol) {
    case "http":
      return <Globe02 className={className} />;
    case "sse":
      return <Server01 className={className} />;
    case "stdio":
      return <Terminal className={className} />;
  }
}

/**
 * Get display label for protocol
 */
function getProtocolLabel(protocol: Protocol): string {
  switch (protocol) {
    case "http":
      return "HTTP";
    case "sse":
      return "SSE";
    case "stdio":
      return "STDIO";
  }
}

/**
 * Group remotes by hostname and collect protocols
 */
function groupRemotesIntoServers(
  remotes: MCPServersListProps["remotes"],
): RemoteServer[] {
  const groups = new Map<string, RemoteServer>();

  remotes.forEach((remote, index) => {
    const hostname = getHostname(remote.url);
    const protocol = normalizeProtocol(remote.type);

    if (!groups.has(hostname)) {
      groups.set(hostname, {
        index,
        hostname,
        url: remote.url,
        name: remote.name,
        title: remote.title,
        description: remote.description,
        protocols: [],
      });
    }

    const group = groups.get(hostname)!;
    if (!group.protocols.includes(protocol)) {
      group.protocols.push(protocol);
    }
    // Update metadata if not set
    if (!group.name && remote.name) group.name = remote.name;
    if (!group.title && remote.title) group.title = remote.title;
    if (!group.description && remote.description)
      group.description = remote.description;
  });

  // Sort protocols: HTTP first
  for (const group of groups.values()) {
    group.protocols.sort((a, b) => {
      const order: Record<Protocol, number> = { http: 0, sse: 1, stdio: 2 };
      return order[a] - order[b];
    });
  }

  return Array.from(groups.values());
}

const FILTER_OPTIONS: { value: Protocol | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "http", label: "HTTP" },
  { value: "sse", label: "SSE" },
  { value: "stdio", label: "STDIO" },
];

export function MCPServersList({
  remotes,
  onInstall,
  isInstalling = false,
}: MCPServersListProps) {
  const [filter, setFilter] = useState<Protocol | "all">("all");

  const servers = useMemo(() => groupRemotesIntoServers(remotes), [remotes]);

  const filteredServers = useMemo(() => {
    if (filter === "all") return servers;
    return servers.filter((s) => s.protocols.includes(filter));
  }, [servers, filter]);

  // Get available filters based on what protocols exist
  const availableFilters = useMemo(() => {
    const protocols = new Set<Protocol>();
    for (const server of servers) {
      for (const p of server.protocols) {
        protocols.add(p);
      }
    }
    return FILTER_OPTIONS.filter(
      (f) => f.value === "all" || protocols.has(f.value as Protocol),
    );
  }, [servers]);

  return (
    <div className="p-5">
      {/* Filters */}
      {availableFilters.length > 2 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <div className="flex gap-1">
            {availableFilters.map((option) => (
              <Button
                key={option.value}
                variant={filter === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(option.value)}
                className="cursor-pointer"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Server Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredServers.map((server) => (
          <Card
            key={server.hostname}
            className="p-4 flex flex-col gap-3 hover:bg-muted/50 transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">
                  {server.title || server.name || server.hostname}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {server.hostname}
                </p>
              </div>
              {/* Protocol badges */}
              <div className="flex gap-1 shrink-0">
                {server.protocols.map((protocol) => (
                  <div
                    key={protocol}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                      protocol === "http" &&
                        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                      protocol === "sse" &&
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      protocol === "stdio" &&
                        "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
                    )}
                  >
                    <ProtocolIcon protocol={protocol} className="w-3 h-3" />
                    {getProtocolLabel(protocol)}
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            {server.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {server.description}
              </p>
            )}

            {/* Install Button */}
            <Button
              variant="brand"
              size="sm"
              onClick={() => onInstall(server.index)}
              disabled={isInstalling}
              className="w-full mt-auto cursor-pointer"
            >
              <Plus size={16} />
              {isInstalling ? "Connecting..." : "Connect"}
            </Button>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {filteredServers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No servers match the selected filter.
        </div>
      )}
    </div>
  );
}
