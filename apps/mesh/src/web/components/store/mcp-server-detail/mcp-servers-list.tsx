import { useState, useMemo, useEffect } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Plus, Server01, Globe02, Terminal } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import type {
  Protocol,
  Remote,
  ServerCardData,
  ProtocolFilterOption,
} from "./types";

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

/** Get display label for protocol */
function getProtocolLabel(protocol: Protocol): string {
  const labels: Record<Protocol, string> = {
    http: "HTTP",
    sse: "SSE",
    stdio: "STDIO",
  };
  return labels[protocol];
}

/** Convert remotes to server card data */
function remotesToServerCards(remotes: Remote[]): ServerCardData[] {
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

interface ProtocolBadgeProps {
  protocol: Protocol;
}

/** Badge showing protocol type with icon and color */
function ProtocolBadge({ protocol }: ProtocolBadgeProps) {
  const colorClasses: Record<Protocol, string> = {
    http: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    sse: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    stdio:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
        colorClasses[protocol],
      )}
    >
      <ProtocolIcon protocol={protocol} className="w-3 h-3" />
      {getProtocolLabel(protocol)}
    </div>
  );
}

interface ServerCardProps {
  card: ServerCardData;
  icon?: string | null;
  mcpName?: string;
  isInstalling?: boolean;
  onInstall: () => void;
}

/** Individual server card component */
function ServerCard({
  card,
  icon,
  mcpName,
  isInstalling,
  onInstall,
}: ServerCardProps) {
  return (
    <Card
      className="p-4 flex flex-col gap-3 hover:bg-muted/50 transition-colors cursor-pointer group"
      onClick={onInstall}
    >
      {/* Header with icon */}
      <div className="flex items-start gap-3">
        <IntegrationIcon
          icon={icon}
          name={mcpName || card.displayName}
          size="sm"
          className="shrink-0 shadow-sm"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm truncate">{card.displayName}</h3>
            <ProtocolBadge protocol={card.protocol} />
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
          onInstall();
        }}
        disabled={isInstalling}
        className="w-full mt-auto cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity"
      >
        <Plus size={16} />
        {isInstalling ? "Connecting..." : "Connect"}
      </Button>
    </Card>
  );
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
  remotes: Remote[];
  onInstall: (remoteIndex: number) => void;
  isInstalling?: boolean;
  icon?: string | null;
  mcpName?: string;
}

export function MCPServersList({
  remotes,
  onInstall,
  isInstalling = false,
  icon,
  mcpName,
}: MCPServersListProps) {
  const [filter, setFilter] = useState<Protocol | "all">("http");

  const serverCards = useMemo(() => remotesToServerCards(remotes), [remotes]);

  const filteredCards = useMemo(() => {
    if (filter === "all") return serverCards;
    return serverCards.filter((c) => c.protocol === filter);
  }, [serverCards, filter]);

  // Get available filters based on existing protocols
  const availableFilters = useMemo(() => {
    const protocols = new Set(serverCards.map((c) => c.protocol));
    const options = FILTER_OPTIONS.filter(
      (f) => f.value === "all" || protocols.has(f.value as Protocol),
    );
    // Hide "All" if only one protocol type exists
    return protocols.size <= 1
      ? options.filter((f) => f.value !== "all")
      : options;
  }, [serverCards]);

  // Auto-switch filter if selected protocol doesn't exist
  useEffect(() => {
    const hasSelectedProtocol =
      filter === "all" || serverCards.some((c) => c.protocol === filter);
    const firstCard = serverCards[0];
    if (!hasSelectedProtocol && firstCard) {
      setFilter(firstCard.protocol);
    }
  }, [serverCards, filter]);

  return (
    <div className="p-5">
      <FilterButtons
        options={availableFilters}
        selected={filter}
        onSelect={setFilter}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCards.map((card) => (
          <ServerCard
            key={`${card.hostname}-${card.protocol}-${card.index}`}
            card={card}
            icon={icon}
            mcpName={mcpName}
            isInstalling={isInstalling}
            onInstall={() => onInstall(card.index)}
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
