import type { RegistryItem } from "@/web/components/store/types";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { getPackageDisplayName } from "@/web/utils/extract-connection-data";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus, ChevronDown, CheckCircle } from "@untitledui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { useState, useEffect, useMemo } from "react";
import type { MCPServerData } from "./types";

type Protocol = "http" | "sse" | "stdio";

interface HostnameGroup {
  hostname: string;
  protocols: {
    type: Protocol;
    index: number;
    url?: string;
  }[];
}

/**
 * Extract hostname from URL or return placeholder for STDIO
 */
function getHostname(url?: string, type?: string): string {
  // STDIO remotes might not have a URL
  if (type?.toLowerCase() === "stdio") {
    return url ? url : "Local (STDIO)";
  }
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
  // streamable-http, http, etc. -> http
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
 * Group remotes by hostname with available protocols
 * Returns: { "docs.mcp.cloudflare.com": { protocols: [{type: "http", index: 0}, {type: "sse", index: 1}] } }
 */
function groupRemotesByHostname(
  remotes: Array<{ type?: string; url?: string }>,
): HostnameGroup[] {
  const groups = new Map<string, HostnameGroup>();

  remotes.forEach((remote, index) => {
    const protocol = normalizeProtocol(remote.type);
    const hostname = getHostname(remote.url, remote.type);

    if (!groups.has(hostname)) {
      groups.set(hostname, { hostname, protocols: [] });
    }

    // Only add if this protocol isn't already added for this hostname
    const group = groups.get(hostname)!;
    if (!group.protocols.some((p) => p.type === protocol)) {
      group.protocols.push({ type: protocol, index, url: remote.url });
    }
  });

  // Sort protocols: HTTP first, then SSE, then STDIO
  const protocolOrder: Record<Protocol, number> = { http: 0, sse: 1, stdio: 2 };
  for (const group of groups.values()) {
    group.protocols.sort(
      (a, b) => protocolOrder[a.type] - protocolOrder[b.type],
    );
  }

  return Array.from(groups.values());
}

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
  /** Hide install controls (when showing servers list tab instead) */
  hideInstallControls?: boolean;
}

type InstallMode = "remote" | "package";

export function MCPServerHeroSection({
  data,
  itemVersions,
  onInstall,
  canInstall = true,
  isInstalling = false,
  hideInstallControls = false,
}: MCPServerHeroSectionProps) {
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number>(0);
  const [selectedPackageIndex, setSelectedPackageIndex] = useState<number>(0);

  const selectedVersion = itemVersions[selectedVersionIndex] || itemVersions[0];
  const remotes = selectedVersion?.server?.remotes ?? [];
  const packages = selectedVersion?.server?.packages ?? [];
  const hasPackages = packages.length > 0;
  const hasRemotes = remotes.length > 0;
  const hasMultiplePackages = packages.length > 1;

  // Group remotes by hostname
  const hostnameGroups = useMemo(
    () => groupRemotesByHostname(remotes),
    [remotes],
  );

  // Separate state for hostname and protocol selection
  const [selectedHostname, setSelectedHostname] = useState<string>("");
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol>("http");
  const [installMode, setInstallMode] = useState<InstallMode>("remote");

  // Initialize selections when data changes
  useEffect(() => {
    const firstGroup = hostnameGroups[0];
    if (firstGroup) {
      setSelectedHostname(firstGroup.hostname);
      // Default to HTTP if available
      const httpProtocol = firstGroup.protocols.find((p) => p.type === "http");
      const defaultProtocol =
        httpProtocol?.type ?? firstGroup.protocols[0]?.type ?? "http";
      setSelectedProtocol(defaultProtocol);
    }
  }, [hostnameGroups]);

  // Update install mode based on available options
  useEffect(() => {
    if (!hasRemotes && hasPackages) {
      setInstallMode("package");
    } else if (hasRemotes) {
      setInstallMode("remote");
    }
  }, [hasRemotes, hasPackages]);

  // Get current hostname group
  const currentGroup = useMemo(
    () => hostnameGroups.find((g) => g.hostname === selectedHostname),
    [hostnameGroups, selectedHostname],
  );

  // Get available protocols for current hostname
  const availableProtocols = currentGroup?.protocols ?? [];

  // Derive the remote index from hostname + protocol selection
  const selectedRemoteIndex = useMemo(() => {
    if (!currentGroup) return 0;
    const protocol = currentGroup.protocols.find(
      (p) => p.type === selectedProtocol,
    );
    return protocol?.index ?? currentGroup.protocols[0]?.index ?? 0;
  }, [currentGroup, selectedProtocol]);

  // Visibility logic
  const hasMultipleHostnames = hostnameGroups.length > 1;
  const hasMultipleProtocols = availableProtocols.length > 1;
  const hasMultipleModes = hasRemotes && hasPackages;

  const handleInstall = () => {
    if (installMode === "package") {
      onInstall(selectedVersionIndex, undefined, selectedPackageIndex);
    } else {
      onInstall(selectedVersionIndex, selectedRemoteIndex, undefined);
    }
  };

  const handleInstallVersion = (versionIndex: number) => {
    setSelectedVersionIndex(versionIndex);
    if (installMode === "package") {
      onInstall(versionIndex, undefined, selectedPackageIndex);
    } else {
      onInstall(versionIndex, selectedRemoteIndex, undefined);
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

        {/* Install Controls */}
        {canInstall && !hideInstallControls ? (
          <div className="shrink-0 flex items-center gap-2">
            {/* Install Mode Toggle - only show if both remotes and packages available */}
            {hasMultipleModes && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isInstalling}
                    className="cursor-pointer"
                  >
                    {installMode === "remote" ? "Remote" : "Local (NPX)"}
                    <ChevronDown size={14} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onClick={() => setInstallMode("remote")}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>Remote</span>
                      {installMode === "remote" && (
                        <CheckCircle
                          size={14}
                          className="text-muted-foreground"
                        />
                      )}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setInstallMode("package")}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>Local (NPX)</span>
                      {installMode === "package" && (
                        <CheckCircle
                          size={14}
                          className="text-muted-foreground"
                        />
                      )}
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Remote mode selectors */}
            {installMode === "remote" && (
              <>
                {/* Server/Hostname Selector - only if multiple hostnames */}
                {hasMultipleHostnames && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isInstalling}
                        className="cursor-pointer max-w-[200px]"
                      >
                        <span className="truncate">{selectedHostname}</span>
                        <ChevronDown size={14} className="ml-1 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-64 max-h-[300px] overflow-y-auto"
                    >
                      {hostnameGroups.map((group) => (
                        <DropdownMenuItem
                          key={group.hostname}
                          onClick={() => {
                            setSelectedHostname(group.hostname);
                            // Reset to HTTP if available for new hostname
                            const httpProtocol = group.protocols.find(
                              (p) => p.type === "http",
                            );
                            const defaultProtocol =
                              httpProtocol?.type ??
                              group.protocols[0]?.type ??
                              "http";
                            setSelectedProtocol(defaultProtocol);
                          }}
                          disabled={isInstalling}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="truncate">{group.hostname}</span>
                            {group.hostname === selectedHostname && (
                              <CheckCircle
                                size={14}
                                className="text-muted-foreground shrink-0"
                              />
                            )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Protocol Selector - only if multiple protocols available */}
                {hasMultipleProtocols && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isInstalling}
                        className="cursor-pointer"
                      >
                        {getProtocolLabel(selectedProtocol)}
                        <ChevronDown size={14} className="ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      {availableProtocols.map((protocol) => (
                        <DropdownMenuItem
                          key={protocol.type}
                          onClick={() => setSelectedProtocol(protocol.type)}
                          disabled={isInstalling}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span>{getProtocolLabel(protocol.type)}</span>
                            {protocol.type === selectedProtocol && (
                              <CheckCircle
                                size={14}
                                className="text-muted-foreground"
                              />
                            )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}

            {/* Package mode selector */}
            {installMode === "package" && hasMultiplePackages && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isInstalling}
                    className="cursor-pointer max-w-[200px]"
                  >
                    <span className="truncate">
                      {getPackageDisplayName(packages[selectedPackageIndex])}
                    </span>
                    <ChevronDown size={14} className="ml-1 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64 max-h-[300px] overflow-y-auto"
                >
                  {packages.map((pkg, index) => (
                    <DropdownMenuItem
                      key={index}
                      onClick={() => setSelectedPackageIndex(index)}
                      disabled={isInstalling}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">
                            {getPackageDisplayName(pkg)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {pkg.identifier || pkg.name}
                          </span>
                        </div>
                        {index === selectedPackageIndex && (
                          <CheckCircle
                            size={14}
                            className="text-muted-foreground shrink-0"
                          />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Connect Button - with version selector if multiple versions */}
            {itemVersions.length > 1 ? (
              <div className="flex">
                <Button
                  variant="brand"
                  onClick={handleInstall}
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
                className="shrink-0 cursor-pointer"
              >
                <Plus size={20} />
                {isInstalling ? "Connecting..." : "Connect"}
              </Button>
            )}
          </div>
        ) : !hideInstallControls ? (
          <div className="shrink-0 px-4 py-2 text-sm text-muted-foreground bg-muted rounded-lg">
            Cannot be connected
          </div>
        ) : null}
      </div>
    </div>
  );
}
