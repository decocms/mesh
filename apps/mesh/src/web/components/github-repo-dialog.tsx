import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { KEYS } from "@/web/lib/query-keys";
import { toast } from "sonner";
import { Check, Copy01, Loading01 } from "@untitledui/icons";

interface Installation {
  installationId: number;
  orgName: string;
  avatarUrl: string | null;
}

interface Repo {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  private: boolean;
}

const GITHUB_APP_INSTALL_URL =
  "https://github.com/apps/deco-cms/installations/new";

const GITHUB_TOKEN_KEY = "deco:github-token";

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(GITHUB_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string): void {
  try {
    localStorage.setItem(GITHUB_TOKEN_KEY, token);
  } catch {
    // localStorage unavailable
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
  } catch {
    // localStorage unavailable
  }
}

// Typed global for passing device flow data from button to dialog
declare global {
  interface Window {
    __decoGithubDeviceFlow?: {
      userCode: string;
      verificationUri: string;
      deviceCode: string;
      expiresIn: number;
      interval: number;
    };
  }
}

export function GitHubRepoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [selectedInstallation, setSelectedInstallation] =
    useState<Installation | null>(null);
  const [search, setSearch] = useState("");
  const [deviceFlow, setDeviceFlow] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    interval: number;
  } | null>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartedRef = useRef(false);

  // Pick up device flow data pre-started by the button when dialog opens
  if (open && !deviceFlow && !token && window.__decoGithubDeviceFlow) {
    const data = window.__decoGithubDeviceFlow;
    delete window.__decoGithubDeviceFlow;
    setDeviceFlow(data);
    // Auto-copy code to clipboard
    navigator.clipboard.writeText(data.userCode).catch(() => {});
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const startPolling = (deviceCode: string, interval: number) => {
    setPolling(true);
    // Clear any existing timer
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(
      async () => {
        try {
          const result = await client.callTool({
            name: "GITHUB_DEVICE_FLOW_POLL",
            arguments: { deviceCode },
          });
          const payload =
            (result as { structuredContent?: unknown }).structuredContent ??
            result;
          const data = payload as {
            status: "pending" | "success" | "expired" | "error";
            token: string | null;
            error: string | null;
          };

          if (data.status === "success" && data.token) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setPolling(false);
            setToken(data.token);
            storeToken(data.token);
            setDeviceFlow(null);
          } else if (data.status === "expired" || data.status === "error") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setPolling(false);
            setDeviceFlow(null);
            toast.error(
              data.error ?? "Authentication expired. Please try again.",
            );
          }
          // "pending" — keep polling
        } catch {
          // Network error — keep polling
        }
      },
      (interval + 1) * 1000,
    ); // Add 1s buffer to avoid "slow_down"
  };

  // Auto-start polling if dialog opened with pre-started device flow data
  if (deviceFlow && !pollingStartedRef.current && !polling && !token) {
    pollingStartedRef.current = true;
    startPolling(deviceFlow.deviceCode, deviceFlow.interval);
  }

  // List installations (only when we have a token)
  const installationsQuery = useQuery({
    queryKey: KEYS.githubInstallations(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "GITHUB_LIST_INSTALLATIONS",
        arguments: { token: token! },
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      return payload as { installations: Installation[] };
    },
    enabled: open && !!token,
    // Auto-poll while waiting for the user to install the GitHub App.
    // Once installations are found the UI moves to the next screen.
    refetchInterval: 3000,
  });

  // Derive effective installation
  const installations = installationsQuery.data?.installations ?? [];
  const effectiveInstallation =
    installations.length === 1
      ? (installations[0] ?? null)
      : selectedInstallation;

  // List repos for effective installation
  const reposQuery = useQuery({
    queryKey: KEYS.githubRepos(
      org.id,
      String(effectiveInstallation?.installationId),
    ),
    queryFn: async () => {
      if (!effectiveInstallation) return { repos: [] };
      const result = await client.callTool({
        name: "GITHUB_LIST_REPOS",
        arguments: {
          token: token!,
          installationId: effectiveInstallation.installationId,
        },
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      return payload as { repos: Repo[] };
    },
    enabled: !!effectiveInstallation && !!token,
  });

  // Save selected repo
  const saveMutation = useMutation({
    mutationFn: async (repo: Repo) => {
      if (!inset?.entity) throw new Error("No virtual MCP context");
      await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_UPDATE",
        arguments: {
          id: inset.entity.id,
          data: {
            metadata: {
              githubRepo: {
                url: repo.url,
                owner: repo.owner,
                name: repo.name,
                installationId: effectiveInstallation!.installationId,
              },
              // Clear stale VMs so VM_START creates a fresh VM with the new repo
              // instead of resuming one that has the old repo cloned.
              activeVms: {},
            },
          },
        },
      });
    },
    onSuccess: (_data, repo) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key[1] === org.id &&
            key[3] === "collection" &&
            key[4] === "VIRTUAL_MCP"
          );
        },
      });
      toast.success("GitHub repo connected");
      onOpenChange(false);

      // Background: fetch instructions + detect runtime
      const currentToken = getStoredToken();
      if (currentToken && inset?.entity) {
        const entityId = inset.entity.id;
        const invalidateVirtualMcp = () =>
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey;
              return (
                key[1] === org.id &&
                key[3] === "collection" &&
                key[4] === "VIRTUAL_MCP"
              );
            },
          });

        const checkFileExists = async (path: string) => {
          const result = await client.callTool({
            name: "GITHUB_GET_FILE_CONTENT",
            arguments: {
              token: currentToken,
              owner: repo.owner,
              repo: repo.name,
              path,
            },
          });
          const payload =
            (result as { structuredContent?: unknown }).structuredContent ??
            result;
          return payload as { content: string | null; found: boolean };
        };

        // Fetch AGENTS.md > CLAUDE.md
        const fetchInstructions = async () => {
          for (const path of ["AGENTS.md", "CLAUDE.md"]) {
            const data = await checkFileExists(path);
            if (data.found && data.content) {
              await client.callTool({
                name: "COLLECTION_VIRTUAL_MCP_UPDATE",
                arguments: {
                  id: entityId,
                  data: { metadata: { instructions: data.content } },
                },
              });
              invalidateVirtualMcp();
              return;
            }
          }
        };

        // Detect package manager and scripts
        const detectRuntime = async () => {
          const runtimeFiles: Array<{ file: string; runtime: string }> = [
            { file: "deno.json", runtime: "deno" },
            { file: "deno.jsonc", runtime: "deno" },
            { file: "bun.lock", runtime: "bun" },
            { file: "bunfig.toml", runtime: "bun" },
            { file: "pnpm-lock.yaml", runtime: "pnpm" },
            { file: "yarn.lock", runtime: "yarn" },
            { file: "package-lock.json", runtime: "npm" },
            { file: "package.json", runtime: "npm" },
          ];

          const installCommands: Record<string, string> = {
            deno: "deno install",
            bun: "bun install",
            pnpm: "pnpm install",
            yarn: "yarn install",
            npm: "npm install",
          };

          let detected: string | null = null;
          for (const { file, runtime } of runtimeFiles) {
            const data = await checkFileExists(file);
            if (data.found) {
              detected = runtime;
              break;
            }
          }

          if (!detected) return;

          const installScript = installCommands[detected] ?? "";

          // Try to find dev script from package.json or deno.json
          let devScript = "";
          let devPort = "";

          if (detected === "deno") {
            // Check deno.json for tasks
            for (const denoFile of ["deno.json", "deno.jsonc"]) {
              const data = await checkFileExists(denoFile);
              if (data.found && data.content) {
                try {
                  const deno = JSON.parse(data.content) as {
                    tasks?: Record<string, string>;
                  };
                  const tasks = deno.tasks ?? {};
                  if (tasks.dev) {
                    devScript = "deno task dev";
                    // Try to extract port from the dev task command
                    const portMatch = tasks.dev.match(
                      /(?:--port|PORT=|:)(\d{4,5})/,
                    );
                    if (portMatch?.[1]) devPort = portMatch[1];
                  } else if (tasks.start) {
                    devScript = "deno task start";
                  }
                } catch {
                  // Invalid JSON
                }
                break;
              }
            }
          } else {
            const pkgData = await checkFileExists("package.json");
            if (pkgData.found && pkgData.content) {
              try {
                const pkg = JSON.parse(pkgData.content) as {
                  scripts?: Record<string, string>;
                };
                const scripts = pkg.scripts ?? {};
                const runPrefix = `${detected} run`;
                if (scripts.dev) {
                  devScript = `${runPrefix} dev`;
                  const portMatch = scripts.dev.match(
                    /(?:--port|PORT=|:)(\d{4,5})/,
                  );
                  if (portMatch?.[1]) devPort = portMatch[1];
                } else if (scripts.start) {
                  devScript = `${runPrefix} start`;
                }
              } catch {
                // Invalid JSON, skip
              }
            }
          }

          await client.callTool({
            name: "COLLECTION_VIRTUAL_MCP_UPDATE",
            arguments: {
              id: entityId,
              data: {
                metadata: {
                  runtime: {
                    detected,
                    selected: detected,
                    installScript,
                    devScript,
                    port: devPort || "8000",
                  },
                },
              },
            },
          });
          invalidateVirtualMcp();
        };

        fetchInstructions().catch(() => {});
        detectRuntime().catch(() => {});
      }
    },
    onError: (error) => {
      toast.error(
        "Failed to connect repo: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  const handleInstallApp = () => {
    const popup = window.open(
      GITHUB_APP_INSTALL_URL,
      "github-app-install",
      "width=800,height=600,popup=yes",
    );
    const interval = setInterval(() => {
      if (popup?.closed) {
        clearInterval(interval);
        installationsQuery.refetch();
      }
    }, 1000);
  };

  const filteredRepos =
    reposQuery.data?.repos.filter((repo) =>
      repo.fullName.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  const renderContent = () => {
    // No token — show device flow auth
    if (!token) {
      // Device flow started — show code
      if (deviceFlow) {
        return (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-sm text-muted-foreground text-center">
              Enter this code on the GitHub page:
            </p>
            <button
              type="button"
              onClick={() => handleCopyCode(deviceFlow.userCode)}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
            >
              <code className="text-2xl font-mono font-bold tracking-widest">
                {deviceFlow.userCode}
              </code>
              {copied ? (
                <Check size={16} className="text-green-500 shrink-0" />
              ) : (
                <Copy01 size={16} className="text-muted-foreground shrink-0" />
              )}
            </button>
            <a
              href={deviceFlow.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              Open GitHub &rarr;
            </a>
            {polling && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loading01 size={14} className="animate-spin" />
                Waiting for authorization...
              </div>
            )}
          </div>
        );
      }

      // Waiting for device flow to start (shouldn't normally happen)
      return (
        <div className="flex items-center justify-center py-8">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
        </div>
      );
    }

    // Loading installations
    if (installationsQuery.isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
        </div>
      );
    }

    // Error loading installations (token might be invalid)
    if (installationsQuery.isError) {
      return (
        <div className="flex flex-col items-center gap-4 py-6">
          <p className="text-sm text-muted-foreground text-center">
            GitHub token may have expired.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              clearStoredToken();
              setToken(null);
              setDeviceFlow(null);
            }}
          >
            Re-authenticate
          </Button>
        </div>
      );
    }

    // No installations — prompt app install
    if (installations.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 py-6">
          <p className="text-sm text-muted-foreground text-center">
            Install the Deco CMS GitHub App on your organization to continue.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleInstallApp}>Install GitHub App</Button>
            <Button
              variant="outline"
              onClick={() => installationsQuery.refetch()}
              disabled={installationsQuery.isFetching}
            >
              {installationsQuery.isFetching
                ? "Checking..."
                : "I've installed it"}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => {
              clearStoredToken();
              setToken(null);
              setDeviceFlow(null);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Wrong account? Re-authenticate
          </button>
        </div>
      );
    }

    // Multiple installations and none selected
    if (!effectiveInstallation) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Select an organization:
          </p>
          {installations.map((inst) => (
            <button
              key={inst.installationId}
              type="button"
              onClick={() => setSelectedInstallation(inst)}
              className="flex items-center gap-3 p-3 rounded-md border hover:bg-accent transition-colors text-left"
            >
              {inst.avatarUrl && (
                <img
                  src={inst.avatarUrl}
                  alt={inst.orgName}
                  className="size-8 rounded-full"
                />
              )}
              <span className="text-sm font-medium">{inst.orgName}</span>
            </button>
          ))}
        </div>
      );
    }

    // Repo picker
    if (reposQuery.isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {installations.length > 1 && (
          <button
            type="button"
            onClick={() => setSelectedInstallation(null)}
            className="text-xs text-muted-foreground hover:text-foreground self-start"
          >
            &larr; Change organization
          </button>
        )}
        <Input
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
          {filteredRepos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No repositories found
            </p>
          ) : (
            filteredRepos.map((repo) => (
              <button
                key={repo.fullName}
                type="button"
                onClick={() => saveMutation.mutate(repo)}
                disabled={saveMutation.isPending}
                className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors text-left"
              >
                <span className="text-sm">{repo.fullName}</span>
                {repo.private && (
                  <span className="text-xs text-muted-foreground">private</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect GitHub Repository</DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
