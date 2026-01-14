import { useState } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { Globe02, Server01, Terminal } from "@untitledui/icons";
import { MCPServerCard } from "../mcp-server-card";
import type {
  Protocol,
  UnifiedServerEntry,
  ServerCardData,
  ProtocolFilterOption,
} from "../types";

// ============================================================================
// Constants
// ============================================================================

/** Protocol filter options */
const FILTER_OPTIONS: ProtocolFilterOption[] = [
  { value: "http", label: "HTTP" },
  { value: "sse", label: "SSE" },
  { value: "stdio", label: "STDIO" },
  { value: "all", label: "All" },
];

/** Common service name mappings for friendly display */
const SERVICE_NAME_MAPPINGS: Record<string, string> = {
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

// ============================================================================
// Utility Functions
// ============================================================================

/** Extract hostname from URL */
function getHostname(url?: string): string {
  if (!url) return "Local";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Extract service name from subdomain
 * e.g., "docs.mcp.cloudflare.com" -> "docs"
 */
function extractServiceName(url?: string): string {
  if (!url) return "local";
  try {
    const hostname = new URL(url).hostname;
    const firstPart = hostname.split(".")[0];
    return firstPart || hostname;
  } catch {
    return "unknown";
  }
}

/** Convert service name to friendly display name */
function formatServiceName(serviceName: string): string {
  const mapped = SERVICE_NAME_MAPPINGS[serviceName.toLowerCase()];
  if (mapped) return mapped;

  // Convert kebab-case or snake_case to Title Case
  return serviceName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize remote type to protocol */
function normalizeProtocol(type?: string): Protocol {
  if (!type) return "http";
  const lower = type.toLowerCase();
  if (lower === "sse") return "sse";
  if (lower === "stdio") return "stdio";
  return "http";
}

/** Convert unified server entries to server card data */
function serversToCards(servers: UnifiedServerEntry[]): ServerCardData[] {
  return servers.map((server, index) => {
    const protocol = normalizeProtocol(server.type);
    const hostname = getHostname(server.url);
    const serviceName = extractServiceName(server.url);
    const displayName =
      server.title || server.name || formatServiceName(serviceName);

    return {
      index,
      protocol,
      url: server.url,
      hostname,
      serviceName,
      displayName,
      name: server.name,
      title: server.title,
      description: server.description,
      _type: server._type,
      _index: server._index,
    };
  });
}

// ============================================================================
// Components
// ============================================================================

interface ProtocolIconProps {
  protocol: Protocol;
  className?: string;
}

/** Icon component for protocol types */
function ProtocolIcon({ protocol, className }: ProtocolIconProps) {
  const icons: Record<Protocol, React.ReactNode> = {
    http: <Globe02 className={className} />,
    sse: <Server01 className={className} />,
    stdio: <Terminal className={className} />,
  };
  return icons[protocol];
}

interface FilterButtonsProps {
  options: ProtocolFilterOption[];
  selected: Protocol | "all";
  onSelect: (value: Protocol | "all") => void;
}

/** Protocol filter buttons */
function FilterButtons({ options, selected, onSelect }: FilterButtonsProps) {
  if (options.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-sm text-muted-foreground">Protocol:</span>
      <div className="flex gap-1">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={selected === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => onSelect(option.value)}
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
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface MCPServersListProps {
  servers: UnifiedServerEntry[];
  onInstall: (entry: UnifiedServerEntry) => void;
  isInstalling?: boolean;
  icon?: string | null;
  mcpName?: string;
  /** Show STDIO servers in the list (default: false) */
  showStdio?: boolean;
}

export function MCPServersList({
  servers,
  onInstall,
  isInstalling = false,
  icon,
  mcpName,
  showStdio = false,
}: MCPServersListProps) {
  // Filter out STDIO servers if showStdio is false
  const filteredServers = showStdio
    ? servers
    : servers.filter((s) => s.type?.toLowerCase() !== "stdio");

  const serverCards = serversToCards(filteredServers);

  // Default to "all" if less than 13 servers, otherwise "http"
  const defaultFilter = serverCards.length < 13 ? "all" : "http";
  const [selectedFilter, setSelectedFilter] = useState<Protocol | "all">(
    defaultFilter,
  );

  // Calculate effective filter - fallback to "all" if < 13, otherwise first available protocol
  const effectiveFilter = (() => {
    if (selectedFilter === "all") return "all";
    const hasSelected = serverCards.some((c) => c.protocol === selectedFilter);
    if (hasSelected) return selectedFilter;
    // Fallback: use "all" if < 13 servers, otherwise first available protocol
    if (serverCards.length < 13) return "all";
    return serverCards[0]?.protocol ?? "http";
  })();

  const filteredCards =
    effectiveFilter === "all"
      ? serverCards
      : serverCards.filter((c) => c.protocol === effectiveFilter);

  // Get available filters based on existing protocols
  const availableFilters = (() => {
    const protocols = new Set(serverCards.map((c) => c.protocol));
    let options = FILTER_OPTIONS.filter(
      (f) => f.value === "all" || protocols.has(f.value as Protocol),
    );
    // Hide STDIO filter if showStdio is false
    if (!showStdio) {
      options = options.filter((f) => f.value !== "stdio");
    }
    // Hide "All" if only one protocol type exists
    return protocols.size <= 1
      ? options.filter((f) => f.value !== "all")
      : options;
  })();

  return (
    <div className="p-5">
      <FilterButtons
        options={availableFilters}
        selected={effectiveFilter}
        onSelect={setSelectedFilter}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCards.map((card) => (
          <MCPServerCard
            key={`${card.hostname}-${card.protocol}-${card.index}`}
            variant="server"
            icon={icon ?? null}
            displayName={mcpName ? card.displayName : card.displayName}
            description={card.description ?? null}
            hostname={card.hostname}
            protocol={card.protocol}
            isInstalling={isInstalling}
            onClick={() =>
              onInstall({
                type: card.protocol,
                url: card.url,
                name: card.name,
                title: card.title,
                description: card.description,
                _type: card._type,
                _index: card._index,
              })
            }
          />
        ))}
      </div>

      {filteredCards.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No servers match the selected filter.
        </div>
      )}
    </div>
  );
}
