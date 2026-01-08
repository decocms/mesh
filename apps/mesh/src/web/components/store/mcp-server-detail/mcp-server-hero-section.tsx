import type { RegistryItem } from "@/web/components/store/types";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus, ChevronDown, CheckCircle } from "@untitledui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { useState } from "react";
import type { MCPServerData } from "./types";

interface MCPServerHeroSectionProps {
  data: MCPServerData;
  itemVersions: RegistryItem[];
  onInstall: (versionIndex?: number) => void;
  isInstalling?: boolean;
  canInstall?: boolean;
}

export function MCPServerHeroSection({
  data,
  itemVersions,
  onInstall,
  canInstall = true,
  isInstalling = false,
}: MCPServerHeroSectionProps) {
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number>(0);

  const handleInstallVersion = (index: number) => {
    setSelectedVersionIndex(index);
    onInstall(index);
  };

  return (
    <div className="flex items-center gap-4 py-8 px-5 border-b border-border">
      {/* Server Icon */}
      <IntegrationIcon
        icon={data.icon}
        name={data.name}
        size="lg"
        className="shrink-0 shadow-sm"
      />

      {/* Server Info */}
      <div className="flex-1 min-w-0 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-medium">{data.name}</h1>
            {data.verified && (
              <img
                src="/verified-badge.svg"
                alt="Verified"
                className="w-5 h-5 shrink-0"
              />
            )}
          </div>
          {data.shortDescription && (
            <p className="text-sm text-muted-foreground mt-1">
              {data.shortDescription}
            </p>
          )}
        </div>

        {/* Install Button */}
        {canInstall ? (
          <div className="shrink-0">
            {itemVersions.length > 1 ? (
              <div className="flex">
                <Button
                  variant="brand"
                  onClick={() => handleInstallVersion(0)}
                  disabled={isInstalling}
                  className="shrink-0 rounded-r-none cursor-pointer"
                >
                  <Plus size={20} />
                  {isInstalling ? "Connecting..." : "Connect MCP Server"}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="brand"
                      disabled={isInstalling}
                      className="shrink-0 rounded-l-none px-2 border-l-2 border-l-white/50 cursor-pointer"
                    >
                      <ChevronDown size={20} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-56 max-h-[300px] overflow-y-auto"
                  >
                    {itemVersions.map((version, index) => {
                      const versionMeta = version._meta?.[
                        "io.modelcontextprotocol.registry/official"
                      ] as { isLatest?: boolean } | undefined;

                      return (
                        <DropdownMenuItem
                          key={index}
                          onClick={() => handleInstallVersion(index)}
                          disabled={isInstalling}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-sm">
                                v{version.server?.version || "unknown"}
                              </div>
                              {versionMeta?.isLatest && (
                                <div className="text-xs text-muted-foreground/50 font-semibold">
                                  LATEST
                                </div>
                              )}
                            </div>
                            {index === selectedVersionIndex && (
                              <CheckCircle
                                size={16}
                                className="text-muted-foreground shrink-0"
                              />
                            )}
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button
                variant="brand"
                onClick={() => onInstall()}
                disabled={itemVersions.length === 0 || isInstalling}
                className="shrink-0"
              >
                <Plus size={20} />
                {isInstalling ? "Connecting..." : "Connect MCP Server"}
              </Button>
            )}
          </div>
        ) : (
          <div className="shrink-0 px-4 py-2 text-sm text-muted-foreground bg-muted rounded-lg">
            Cannot be connected
          </div>
        )}
      </div>
    </div>
  );
}

