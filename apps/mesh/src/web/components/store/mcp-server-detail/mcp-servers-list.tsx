import { useState, useMemo } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Plus, Server01, Globe02, Terminal } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";

type Protocol = "http" | "sse" | "stdio";

interface ServerCard {
  index: number;
  protocol: Protocol;
  url?: string;
  hostname: string;
  /** Extracted service name from subdomain (e.g., "docs", "bindings") */
  serviceName: string;
  /** Friendly display name */
  displayName: string;
  name?: string;
  title?: string;
  description?: string;
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
  /** Icon for the MCP server */
  icon?: string | null;
  /** Name of the MCP server */
  mcpName?: string;
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
 * Extract service name from subdomain
 * e.g., "docs.mcp.cloudflare.com" -> "docs"
 * e.g., "ai-gateway.mcp.cloudflare.com" -> "ai-gateway"
 */
function extractServiceName(url?: string): string {
  if (!url) return "unknown";
  try {
    const hostname = new URL(url).hostname;
    // Get the first part of the hostname (subdomain)
    const parts = hostname.split(".");
    if (parts.length > 0 && parts[0]) {
      return parts[0];
    }
    return hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Convert service name to friendly display name
 * e.g., "docs" -> "Documentation"
 * e.g., "ai-gateway" -> "AI Gateway"
 */
function formatServiceName(serviceName: string): string {
  // Common service name mappings
  const mappings: Record<string, string> = {
    docs: "Documentation",
    bindings: "Workers Bindings",
    builds: "Workers Builds",
    observability: "Observability",
    radar: "Radar",
    containers: "Containers",
    browser: "Browser Rendering",
    logs: "Logpush",
    autorag: "AutoRAG",
    auditlogs: "Audit Logs",
    graphql: "GraphQL",
    dex: "DEX Monitoring",
    casb: "CASB",
  };

  const mapped = mappings[serviceName.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  // Convert kebab-case or snake_case to Title Case
  return serviceName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
 * Convert remotes to individual server cards (no grouping)
 */
function remotesToServerCards(
  remotes: MCPServersListProps["remotes"],
): ServerCard[] {
  return remotes.map((remote, index) => {
    const protocol = normalizeProtocol(remote.type);
    const hostname = getHostname(remote.url);
    const serviceName = extractServiceName(remote.url);
    const displayName =
      remote.title || remote.name || formatServiceName(serviceName);

    return {
      index,
      protocol,
      url: remote.url,
      hostname,
      serviceName,
      displayName,
      name: remote.name,
      title: remote.title,
      description: remote.description,
    };
  });
}

const FILTER_OPTIONS: { value: Protocol | "all"; label: string }[] = [
  { value: "http", label: "HTTP" },
  { value: "sse", label: "SSE" },
  { value: "stdio", label: "STDIO" },
  { value: "all", label: "All" },
];

export function MCPServersList({
  remotes,
  onInstall,
  isInstalling = false,
  icon,
  mcpName,
}: MCPServersListProps) {
  // Default filter to HTTP
  const [filter, setFilter] = useState<Protocol | "all">("http");

  const serverCards = useMemo(() => remotesToServerCards(remotes), [remotes]);

  const filteredCards = useMemo(() => {
    if (filter === "all") return serverCards;
    return serverCards.filter((s) => s.protocol === filter);
  }, [serverCards, filter]);

  // Get available filters based on what protocols exist
  const availableFilters = useMemo(() => {
    const protocols = new Set<Protocol>();
    for (const card of serverCards) {
      protocols.add(card.protocol);
    }
    // Only show "All" if there are multiple protocol types
    const filterOptions = FILTER_OPTIONS.filter(
      (f) => f.value === "all" || protocols.has(f.value as Protocol),
    );
    // Hide "All" if only one protocol type exists
    if (protocols.size <= 1) {
      return filterOptions.filter((f) => f.value !== "all");
    }
    return filterOptions;
  }, [serverCards]);

  // If HTTP filter is selected but no HTTP cards exist, switch to first available
  useMemo(() => {
    if (filter === "http" && !serverCards.some((c) => c.protocol === "http")) {
      const firstProtocol = serverCards[0]?.protocol;
      if (firstProtocol) {
        setFilter(firstProtocol);
      }
    }
  }, [serverCards, filter]);

  return (
    <div className="p-5">
      {/* Filters */}
      {availableFilters.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Protocol:</span>
          <div className="flex gap-1">
            {availableFilters.map((option) => (
              <Button
                key={option.value}
                variant={filter === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(option.value)}
                className="cursor-pointer"
              >
                <ProtocolIcon
                  protocol={option.value === "all" ? "http" : option.value}
                  className="w-4 h-4 mr-1"
                />
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Server Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCards.map((card) => (
          <Card
            key={`${card.hostname}-${card.protocol}-${card.index}`}
            className="p-4 flex flex-col gap-3 hover:bg-muted/50 transition-colors cursor-pointer group"
            onClick={() => onInstall(card.index)}
          >
            {/* Header with icon */}
            <div className="flex items-start gap-3">
              {/* MCP Icon */}
              <IntegrationIcon
                icon={icon}
                name={mcpName || card.displayName}
                size="sm"
                className="shrink-0 shadow-sm"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm truncate">
                    {card.displayName}
                  </h3>
                  {/* Protocol badge */}
                  <div
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
                      card.protocol === "http" &&
                        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                      card.protocol === "sse" &&
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      card.protocol === "stdio" &&
                        "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
                    )}
                  >
                    <ProtocolIcon
                      protocol={card.protocol}
                      className="w-3 h-3"
                    />
                    {getProtocolLabel(card.protocol)}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {card.hostname}
                </p>
              </div>
            </div>

            {/* Description */}
            {card.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {card.description}
              </p>
            )}

            {/* Install Button */}
            <Button
              variant="brand"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onInstall(card.index);
              }}
              disabled={isInstalling}
              className="w-full mt-auto cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity"
            >
              <Plus size={16} />
              {isInstalling ? "Connecting..." : "Connect"}
            </Button>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {filteredCards.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No servers match the selected filter.
        </div>
      )}
    </div>
  );
}
