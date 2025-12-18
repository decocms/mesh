import type { RegistryItem } from "@/web/components/store/registry-items-section";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { useState } from "react";
import type { AppData } from "./types";

interface AppHeroSectionProps {
  data: AppData;
  itemVersions: RegistryItem[];
  onInstall: (versionIndex?: number) => void;
  isInstalling?: boolean;
  canInstall?: boolean;
}

export function AppHeroSection({
  data,
  itemVersions,
  onInstall,
  canInstall = true,
  isInstalling = false,
}: AppHeroSectionProps) {
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number>(0);

  const handleInstallVersion = (index: number) => {
    setSelectedVersionIndex(index);
    onInstall(index);
  };

  return (
    <div className="pl-10 flex items-start gap-6 pb-12 pr-10 border-b border-border">
      {/* App Icon */}
      <div className="shrink-0 w-16 h-16 rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center text-3xl font-bold text-primary overflow-hidden">
        {data.icon ? (
          <img
            src={data.icon}
            alt={data.name}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = data.name.substring(0, 2).toUpperCase();
              }
            }}
            className="w-full h-full object-cover rounded-2xl"
          />
        ) : (
          data.name.substring(0, 2).toUpperCase()
        )}
      </div>

      {/* App Info */}
      <div className="flex-1 min-w-0 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold">{data.name}</h1>
            {data.verified && (
              <img
                src="/verified-badge.svg"
                alt="Verified"
                className="w-5 h-5 shrink-0"
              />
            )}
          </div>
          {data.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {data.description}
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
                  <Icon name="add" size={20} />
                  {isInstalling ? "Connecting..." : "Connect MCP"}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="brand"
                      disabled={isInstalling}
                      className="shrink-0 rounded-l-none px-2 border-l-2 border-l-white/50 cursor-pointer"
                    >
                      <Icon name="expand_more" size={20} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
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
                          <div className="flex items-start justify-between gap-2 w-full">
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                v{version.server?.version || "unknown"}
                              </div>
                              {versionMeta?.isLatest && (
                                <div className="text-xs text-primary font-semibold mt-1">
                                  LATEST
                                </div>
                              )}
                            </div>
                            {index === selectedVersionIndex && (
                              <Icon
                                name="check_circle"
                                size={16}
                                className="text-primary shrink-0 mt-1"
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
                <Icon name="add" size={20} />
                {isInstalling ? "Connecting..." : "Connect MCP"}
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
