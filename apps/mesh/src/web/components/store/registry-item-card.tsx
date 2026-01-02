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
import type { RegistryItem } from "./registry-items-section";

/**
 * MCP Registry Server structure from LIST response
 */
export interface MCPRegistryServerIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
}

export interface MCPRegistryServerMeta {
  "mcp.mesh"?: {
    id: string;
    verified?: boolean;
    scopeName?: string;
    appName?: string;
    publishedAt?: string;
    updatedAt?: string;
    friendly_name?: string;
    short_description?: string;
    mesh_description?: string;
    tags?: string[];
    categories?: string[];
  };
  "mcp.mesh/publisher-provided"?: {
    friendlyName?: string | null;
    metadata?: Record<string, unknown> | null;
    tools?: Array<{
      id: string;
      name: string;
      description?: string | null;
    }>;
    models?: unknown[];
    emails?: unknown[];
    analytics?: unknown;
    cdn?: unknown;
  };
  [key: string]: unknown;
}

export interface MCPRegistryServer {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  _meta?: MCPRegistryServerMeta;
  server: {
    $schema?: string;
    _meta?: MCPRegistryServerMeta;
    name: string;
    title?: string;
    description?: string;
    icons?: MCPRegistryServerIcon[];
    remotes?: Array<{
      type: "http" | "stdio" | "sse";
      url?: string;
    }>;
    version?: string;
    repository?: {
      url?: string;
      source?: string;
      subfolder?: string;
    };
  };
}

/**
 * Simplified props for RegistryItemCard - receives processed data
 * Reduces component responsibility to just rendering
 */
interface RegistryItemCardProps {
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
export function extractCardDisplayData(
  item: RegistryItem,
): Omit<RegistryItemCardProps, "onClick"> {
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

export function RegistryItemCard({
  icon,
  scopeName,
  displayName,
  description,
  version: _version,
  isVerified,
  canInstall,
  onClick,
}: RegistryItemCardProps) {
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
