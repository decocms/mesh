import { EmptyState } from "@/web/components/empty-state";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { GitHubRepoDialog } from "@/web/components/github-repo-dialog";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { LinkExternal01 } from "@untitledui/icons";

function GitHubIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const GITHUB_TOKEN_KEY = "deco:github-token";

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(GITHUB_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function RepositoryTabContent() {
  const inset = useInsetContext();
  const { org } = useProjectContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const queryClient = useQueryClient();

  const metadata = inset?.entity?.metadata as
    | {
        githubRepo?: { url: string; owner: string; name: string } | null;
        runtime?: {
          detected: string | null;
          selected: string | null;
          installScript?: string | null;
          devScript?: string | null;
        } | null;
      }
    | undefined;

  const githubRepo = metadata?.githubRepo;
  const runtime = metadata?.runtime;

  const handleConnect = async () => {
    if (getStoredToken()) {
      setDialogOpen(true);
      return;
    }

    setStarting(true);
    try {
      const result = await client.callTool({
        name: "GITHUB_DEVICE_FLOW_START",
        arguments: {},
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      const data = payload as {
        userCode: string;
        verificationUri: string;
        deviceCode: string;
        expiresIn: number;
        interval: number;
      };

      window.open(data.verificationUri, "_blank", "noopener");
      setDialogOpen(true);
      window.__decoGithubDeviceFlow = data;
    } catch (error) {
      toast.error(
        "Failed to start GitHub auth: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    } finally {
      setStarting(false);
    }
  };

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

  const handleScriptUpdate = async (
    field: "installScript" | "devScript",
    value: string,
  ) => {
    if (!inset?.entity) return;
    try {
      await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_UPDATE",
        arguments: {
          id: inset.entity.id,
          data: {
            metadata: {
              runtime: {
                ...runtime,
                [field]: value,
              },
            },
          },
        },
      });
      invalidateVirtualMcp();
    } catch {
      toast.error("Failed to update script");
    }
  };

  if (githubRepo) {
    return (
      <div className="flex flex-col gap-4">
        <a
          href={githubRepo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
        >
          <GitHubIcon size={24} />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-sm font-medium truncate">
              {githubRepo.owner}/{githubRepo.name}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {githubRepo.url}
            </span>
          </div>
          <LinkExternal01
            size={14}
            className="text-muted-foreground shrink-0"
          />
        </a>

        <div className="flex flex-col gap-2">
          <Label htmlFor="install-script" className="text-sm font-medium">
            Install Script
          </Label>
          <Input
            id="install-script"
            placeholder="e.g. npm install"
            defaultValue={runtime?.installScript ?? ""}
            onBlur={(e) => handleScriptUpdate("installScript", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dev-script" className="text-sm font-medium">
            Development Script
          </Label>
          <Input
            id="dev-script"
            placeholder="e.g. npm run dev"
            defaultValue={runtime?.devScript ?? ""}
            onBlur={(e) => handleScriptUpdate("devScript", e.target.value)}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <EmptyState
        image={
          <div className="text-muted-foreground/40">
            <GitHubIcon size={64} />
          </div>
        }
        title="No repository connected"
        description="Connect a GitHub repository to enable code sync and deployments."
        actions={
          <Button variant="outline" onClick={handleConnect} disabled={starting}>
            <GitHubIcon size={16} />
            Connect GitHub
          </Button>
        }
      />
      <GitHubRepoDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
