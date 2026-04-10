import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { useState } from "react";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { toast } from "sonner";
import { GitHubRepoDialog } from "./github-repo-dialog";

function GitHubIcon({ size = 16 }: { size?: number }) {
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

export function GitHubRepoButton() {
  const inset = useInsetContext();
  const { org } = useProjectContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  if (!inset?.entity) return null;

  const githubRepo = (
    inset.entity.metadata as {
      githubRepo?: { url: string; owner: string; name: string } | null;
    }
  )?.githubRepo;

  // Connected state: show owner/repo with external link
  if (githubRepo) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={githubRepo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 h-7 px-2 rounded-md text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <GitHubIcon size={14} />
            <span className="max-w-32 truncate">
              {githubRepo.owner}/{githubRepo.name}
            </span>
          </a>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Open {githubRepo.owner}/{githubRepo.name} on GitHub
        </TooltipContent>
      </Tooltip>
    );
  }

  const handleClick = async () => {
    // If user already has a token, skip device flow and go straight to repo picker
    if (getStoredToken()) {
      setDialogOpen(true);
      return;
    }

    // Start device flow immediately, then open dialog with the code
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

      // Auto-open GitHub authorization page
      window.open(data.verificationUri, "_blank", "noopener");

      // Open dialog with device flow data already available
      setDialogOpen(true);
      // Pass the device flow data via a ref on the dialog
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

  // Unconnected state: show octocat icon button
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            disabled={starting}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <GitHubIcon size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Connect GitHub repo</TooltipContent>
      </Tooltip>
      <GitHubRepoDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
