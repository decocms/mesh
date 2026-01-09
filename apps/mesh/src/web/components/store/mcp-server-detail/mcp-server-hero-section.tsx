import type { RegistryItem } from "@/web/components/store/types";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  getRemoteDisplayName,
  getPackageDisplayName,
} from "@/web/utils/extract-connection-data";
import { getConnectionTypeLabel } from "@/web/utils/registry-utils";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus, ChevronDown, CheckCircle } from "@untitledui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { useState, useEffect } from "react";
import type { MCPServerData } from "./types";

interface MCPServerHeroSectionProps {
  data: MCPServerData;
  itemVersions: RegistryItem[];
  onInstall: (
    versionIndex?: number,
    remoteIndex?: number,
    packageIndex?: number,
  ) => void;
  isInstalling?: boolean;
  canInstall?: boolean;
}

type InstallMode = "remote" | "package";

export function MCPServerHeroSection({
  data,
  itemVersions,
  onInstall,
  canInstall = true,
  isInstalling = false,
}: MCPServerHeroSectionProps) {
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number>(0);
  const [selectedRemoteIndex, setSelectedRemoteIndex] = useState<number>(0);
  const [selectedPackageIndex, setSelectedPackageIndex] = useState<number>(0);

  const selectedVersion = itemVersions[selectedVersionIndex] || itemVersions[0];
  const remotes = selectedVersion?.server?.remotes ?? [];
  const packages = selectedVersion?.server?.packages ?? [];
  const hasMultipleRemotes = remotes.length > 1;
  const hasMultiplePackages = packages.length > 1;
  const hasPackages = packages.length > 0;
  const hasRemotes = remotes.length > 0;

  // Determine available install modes
  const availableModes: InstallMode[] = [];
  if (hasRemotes) availableModes.push("remote");
  if (hasPackages) availableModes.push("package");
  const hasMultipleModes = availableModes.length > 1;

  // Default install mode: prefer remote if available, otherwise package
  const [installMode, setInstallMode] = useState<InstallMode>("remote");

  // Update install mode when available modes change
  useEffect(() => {
    if (!hasRemotes && hasPackages) {
      setInstallMode("package");
    } else if (hasRemotes) {
      setInstallMode("remote");
    }
  }, [hasRemotes, hasPackages]);

  const handleInstallVersion = (versionIndex: number) => {
    setSelectedVersionIndex(versionIndex);
    if (installMode === "package") {
      onInstall(versionIndex, undefined, selectedPackageIndex);
    } else {
      onInstall(versionIndex, selectedRemoteIndex, undefined);
    }
  };

  const handleInstall = () => {
    if (installMode === "package") {
      onInstall(selectedVersionIndex, undefined, selectedPackageIndex);
    } else {
      onInstall(selectedVersionIndex, selectedRemoteIndex, undefined);
    }
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
          <div className="shrink-0 flex items-center gap-2">
            {/* Endpoint Selector - shown when multiple remotes OR packages available */}
            {(hasMultipleRemotes ||
              hasMultiplePackages ||
              hasMultipleModes) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={isInstalling}
                    className="shrink-0 cursor-pointer"
                  >
                    <span className="max-w-[150px] truncate">
                      {installMode === "package"
                        ? getPackageDisplayName(packages[selectedPackageIndex])
                        : getRemoteDisplayName(remotes[selectedRemoteIndex])}
                    </span>
                    <ChevronDown size={16} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64 max-h-[300px] overflow-y-auto"
                >
                  {/* Remote options */}
                  {hasRemotes && (
                    <>
                      {hasMultipleModes && (
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Remote Endpoints
                        </div>
                      )}
                      {remotes.map((remote, index) => (
                        <DropdownMenuItem
                          key={`remote-${index}`}
                          onClick={() => {
                            setSelectedRemoteIndex(index);
                            setInstallMode("remote");
                          }}
                          disabled={isInstalling}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {getRemoteDisplayName(remote)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {getConnectionTypeLabel(remote.type) || "HTTP"}
                              </div>
                            </div>
                            {installMode === "remote" &&
                              index === selectedRemoteIndex && (
                                <CheckCircle
                                  size={16}
                                  className="text-muted-foreground shrink-0"
                                />
                              )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}

                  {/* Package options */}
                  {hasPackages && (
                    <>
                      {hasMultipleModes && (
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                          NPM Packages (Local)
                        </div>
                      )}
                      {packages.map((pkg, index) => (
                        <DropdownMenuItem
                          key={`package-${index}`}
                          onClick={() => {
                            setSelectedPackageIndex(index);
                            setInstallMode("package");
                          }}
                          disabled={isInstalling}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {getPackageDisplayName(pkg)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                NPX • {pkg.name}
                              </div>
                            </div>
                            {installMode === "package" &&
                              index === selectedPackageIndex && (
                                <CheckCircle
                                  size={16}
                                  className="text-muted-foreground shrink-0"
                                />
                              )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Version Selector or Simple Install Button */}
            {itemVersions.length > 1 ? (
              <div className="flex">
                <Button
                  variant="brand"
                  onClick={() => handleInstallVersion(0)}
                  disabled={isInstalling}
                  className="shrink-0 rounded-r-none cursor-pointer"
                >
                  <Plus size={20} />
                  {isInstalling ? "Connecting..." : "Connect"}
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
                onClick={handleInstall}
                disabled={itemVersions.length === 0 || isInstalling}
                className="shrink-0"
              >
                <Plus size={20} />
                {isInstalling ? "Connecting..." : "Connect"}
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
