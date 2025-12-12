import type { RegistryItem } from "@/web/components/store/registry-items-section";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import type { AppData } from "./types";

interface AppHeroSectionProps {
  data: AppData;
  itemVersions: RegistryItem[];
  isInstalling: boolean;
  onInstall: (versionIndex?: number) => void;
  canInstall?: boolean;
}

export function AppHeroSection({
  data,
  itemVersions,
  isInstalling,
  onInstall,
  canInstall = true,
}: AppHeroSectionProps) {
  const [showVersions, setShowVersions] = useState(false);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number>(0);
  const versionDropdownRef = useRef<HTMLDivElement>(null);

  const handleInstallVersion = (index: number) => {
    setSelectedVersionIndex(index);
    onInstall(index);
    setShowVersions(false);
  };

  const handleDocumentClick = (event: React.MouseEvent) => {
    // Close dropdown if clicking outside of it
    if (
      showVersions &&
      versionDropdownRef.current &&
      !versionDropdownRef.current.contains(event.target as Node)
    ) {
      setShowVersions(false);
    }
  };

  return (
    <div
      className="pl-10 flex items-start gap-6 pb-12 pr-10 border-b border-border"
      onClick={handleDocumentClick}
    >
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
          <div className="shrink-0 relative" ref={versionDropdownRef}>
            {itemVersions.length > 1 ? (
              <>
                <Button
                  variant="brand"
                  onClick={() => setShowVersions(!showVersions)}
                  disabled={isInstalling}
                  className="shrink-0"
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Icon name="add" size={20} />
                      Install App
                      <Icon
                        name={showVersions ? "expand_less" : "expand_more"}
                        size={16}
                      />
                    </>
                  )}
                </Button>

                {showVersions && (
                  <div className="absolute right-0 mt-1 w-56 bg-background border border-border rounded-lg shadow-lg z-50">
                    <div className="max-h-64 overflow-y-auto">
                      {itemVersions.map((version, index) => {
                        const versionMeta = version._meta?.[
                          "io.modelcontextprotocol.registry/official"
                        ] as { isLatest?: boolean } | undefined;

                        return (
                          <button
                            key={index}
                            onClick={() => handleInstallVersion(index)}
                            className="w-full text-left px-4 py-3 hover:bg-muted border-b border-border last:border-b-0 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
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
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Button
                variant="brand"
                onClick={() => onInstall()}
                disabled={isInstalling || itemVersions.length === 0}
                className="shrink-0"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Icon name="add" size={20} />
                    Install App
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          <div className="shrink-0 px-4 py-2 text-sm text-muted-foreground bg-muted rounded-lg">
            Cannot be installed
          </div>
        )}
      </div>
    </div>
  );
}
