import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { toast } from "sonner";
import { Loading01 } from "@untitledui/icons";

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

// GitHub App installation URL — replace slug with actual Deco CMS app slug
const GITHUB_APP_INSTALL_URL =
  "https://github.com/apps/deco-cms/installations/new";

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
  const [selectedInstallation, setSelectedInstallation] =
    useState<Installation | null>(null);
  const [search, setSearch] = useState("");

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Step 1: Check installations
  const installationsQuery = useQuery({
    queryKey: KEYS.githubInstallations(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "GITHUB_LIST_INSTALLATIONS",
        arguments: {},
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      return payload as {
        installations: Installation[];
        hasGithubAccount: boolean;
      };
    },
    enabled: open,
  });

  // Derive effective installation: auto-select if only one, otherwise use user selection
  const installations = installationsQuery.data?.installations ?? [];
  const effectiveInstallation =
    installations.length === 1
      ? (installations[0] ?? null)
      : selectedInstallation;

  // Step 2: List repos for effective installation
  const reposQuery = useQuery({
    queryKey: KEYS.githubRepos(
      org.id,
      String(effectiveInstallation?.installationId),
    ),
    queryFn: async () => {
      if (!effectiveInstallation) return { repos: [] };
      const result = await client.callTool({
        name: "GITHUB_LIST_REPOS",
        arguments: { installationId: effectiveInstallation.installationId },
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      return payload as { repos: Repo[] };
    },
    enabled: !!effectiveInstallation,
  });

  // Step 3: Save selected repo to virtual MCP metadata
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
            },
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.virtualMcp(org.id, inset?.entity?.id ?? ""),
      });
      toast.success("GitHub repo connected");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        "Failed to connect repo: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  const handleGitHubSignIn = () => {
    // Open GitHub OAuth in popup via Better Auth
    authClient.signIn.social({
      provider: "github",
      callbackURL: window.location.href,
    });
  };

  const handleInstallApp = () => {
    // Open GitHub App installation page in popup
    const popup = window.open(
      GITHUB_APP_INSTALL_URL,
      "github-app-install",
      "width=800,height=600,popup=yes",
    );
    // Poll for popup close, then refetch installations
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

  // Render based on state
  const renderContent = () => {
    // Loading
    if (installationsQuery.isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
        </div>
      );
    }

    // No GitHub account linked — prompt OAuth
    if (!installationsQuery.data?.hasGithubAccount) {
      return (
        <div className="flex flex-col items-center gap-4 py-6">
          <p className="text-sm text-muted-foreground text-center">
            Connect your GitHub account to link a repository.
          </p>
          <Button onClick={handleGitHubSignIn}>Sign in with GitHub</Button>
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
          <Button onClick={handleInstallApp}>Install GitHub App</Button>
        </div>
      );
    }

    // Multiple installations and none selected — show org picker
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

    // Installation resolved — show repo picker
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
