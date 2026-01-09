import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { CheckVerified02, Lock01 } from "@untitledui/icons";
import { Card } from "@deco/ui/components/card.js";
import { IntegrationIcon } from "../integration-icon.tsx";
import { getGitHubAvatarUrl } from "@/web/utils/github-icon";
import { extractDisplayNameFromDomain } from "@/web/utils/app-name";
import type { RegistryItem } from "./types";

// Re-export types for backwards compatibility
export type {
  MCPRegistryServer,
  MCPRegistryServerIcon,
  MCPRegistryServerMeta,
  RegistryItem,
} from "./types";

/**
 * Props for MCPServerCard - receives processed data
 */
interface MCPServerCardProps {
  icon: string | null;
  scopeName: string | null;
  displayName: string;
  description: string | null;
  version: string | null;
  isVerified: boolean;
  canInstall: boolean;
  onClick: () => void;
}

/**
 * Extract display data from a registry item for the card component
 * Handles name parsing, icon extraction, and verification status
 */
function extractCardDisplayData(
  item: RegistryItem,
): Omit<MCPServerCardProps, "onClick"> {
  const rawTitle = item.title || item.server.title || item.id || "Unnamed Item";
  const meshMeta = item._meta?.["mcp.mesh"];

  // Description priority: short_description > mesh_description > server.description
  const description =
    meshMeta?.short_description ||
    meshMeta?.mesh_description ||
    item.server.description ||
    null;

  const icon =
    item.server.icons?.[0]?.src ||
    getGitHubAvatarUrl(item.server.repository) ||
    null;
  const isVerified = meshMeta?.verified ?? false;
  const version = item.server.version;
  const hasRemotes = (item.server.remotes?.length ?? 0) > 0;
  const canInstall = hasRemotes;

  // Extract scopeName and displayName from title if it contains "/"
  let displayName = rawTitle;
  let scopeName: string | null = null;

  if (rawTitle.includes("/")) {
    const parts = rawTitle.split("/");
    if (parts.length >= 2) {
      scopeName = parts[0] || null;
      // Use function to extract the correct name
      displayName = extractDisplayNameFromDomain(rawTitle);
    }
  }

  // Fallback to _meta if scopeName wasn't extracted from title
  if (!scopeName) {
    const metaScopeName = meshMeta?.scopeName;
    const metaAppName = meshMeta?.appName;
    if (metaScopeName && metaAppName) {
      scopeName = `${metaScopeName}/${metaAppName}`;
    } else if (metaScopeName) {
      scopeName = metaScopeName;
    }
  }

  // PRIORITY: Use friendly_name if available, otherwise use displayName
  if (meshMeta?.friendly_name) {
    displayName = meshMeta.friendly_name;
  }

  return {
    icon,
    scopeName,
    displayName,
    description,
    version: version || null,
    isVerified,
    canInstall,
  };
}

/**
 * Card component for displaying an MCP Server in the store grid
 */
function MCPServerCard({
  icon,
  scopeName,
  displayName,
  description,
  version: _version,
  isVerified,
  canInstall,
  onClick,
}: MCPServerCardProps) {
  return (
    <Card
      className="p-6 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex flex-col gap-4 h-full relative">
        <div className="flex gap-3">
          {/* Icon */}
          <IntegrationIcon
            icon={icon}
            name={displayName}
            size="md"
            className="shadow-sm"
          />
          <div className="flex gap-2 items-start min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-base font-medium min-w-0">
                    <span className="truncate">{displayName}</span>
                    {isVerified && (
                      <CheckVerified02
                        size={16}
                        className="text-success shrink-0"
                      />
                    )}
                    {!canInstall && (
                      <Lock01
                        size={16}
                        className="text-muted-foreground shrink-0"
                      />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{displayName}</p>
                  {!canInstall && (
                    <p className="text-xs mt-1">No connection available</p>
                  )}
                </TooltipContent>
              </Tooltip>
              {scopeName && (
                <div className="text-sm text-muted-foreground truncate">
                  {scopeName}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 gap-1 min-w-0">
          <div className="text-sm text-muted-foreground line-clamp-2">
            {description || "No description available"}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Props for MCPServerCardGrid
 */
interface MCPServerCardGridProps {
  items: RegistryItem[];
  title: string;
  subtitle?: string;
  onItemClick: (item: RegistryItem) => void;
  totalCount?: number | null;
}

/**
 * Grid component for displaying multiple MCP Server cards
 */
export function MCPServerCardGrid({
  items,
  title,
  onItemClick,
}: MCPServerCardGridProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {title && (
        <div className="flex items-center justify-between w-max gap-2">
          <h2 className="text-lg font-medium">{title}</h2>
        </div>
      )}
      <div className="grid grid-cols-4 gap-4">
        {items.map((item) => {
          const displayData = extractCardDisplayData(item);
          return (
            <MCPServerCard
              key={item.id}
              {...displayData}
              onClick={() => onItemClick(item)}
            />
          );
        })}
      </div>
    </div>
  );
}
