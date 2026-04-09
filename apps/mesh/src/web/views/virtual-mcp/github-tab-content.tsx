import { useState } from "react";
import type { VirtualMCPEntity } from "@/tools/virtual/schema";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  useVirtualMCPActions,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import { GitBranch01, Loading01 } from "@untitledui/icons";
import {
  parseFreestyleMetadata,
  emptyFreestyleMetadata,
} from "@/freestyle/parse-metadata";
import { useInvalidateVirtualMcp } from "@/web/hooks/use-invalidate-virtual-mcp";
import { getGitHubAvatarUrl } from "@/web/utils/github/github-icon";

export function GitHubTabContent({
  virtualMcp,
}: {
  virtualMcp: VirtualMCPEntity;
}) {
  const fm = parseFreestyleMetadata(virtualMcp.metadata);

  if (fm.repo_url) {
    return <PopulatedState virtualMcp={virtualMcp} />;
  }

  return <EmptyState virtualMcpId={virtualMcp.id} />;
}

// ---------------------------------------------------------------------------
// Empty State — connect a repo
// ---------------------------------------------------------------------------

function EmptyState({ virtualMcpId }: { virtualMcpId: string }) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const invalidateEntity = useInvalidateVirtualMcp();

  const [repoInput, setRepoInput] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddRepo = async () => {
    const value = repoInput.trim();
    if (!value) return;
    setLinking(true);
    setError(null);
    try {
      await client.callTool({
        name: "VIRTUAL_MCP_ADD_REPO",
        arguments: { virtual_mcp_id: virtualMcpId, repo_url: value },
      });
      setRepoInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link repository");
    } finally {
      invalidateEntity();
      setLinking(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto px-4 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center size-14 rounded-2xl bg-muted border border-border/60">
          <GitBranch01 size={24} className="text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <p className="text-xl font-semibold text-foreground tracking-tight">
            Connect a GitHub repository
          </p>
          <p className="text-sm text-muted-foreground max-w-md">
            Link a repo to auto-detect runtime, sync instructions from
            AGENTS.md, and enable live preview.
          </p>
        </div>
      </div>
      <div className="flex gap-2 w-full max-w-sm">
        <Input
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddRepo();
          }}
          placeholder="owner/repo"
          disabled={linking}
        />
        <Button
          variant="outline"
          onClick={handleAddRepo}
          disabled={linking || !repoInput.trim()}
        >
          {linking ? (
            <>
              <Loading01 size={14} className="animate-spin" />
              Linking...
            </>
          ) : (
            "Link"
          )}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Populated State — repo settings
// ---------------------------------------------------------------------------

function PopulatedState({ virtualMcp }: { virtualMcp: VirtualMCPEntity }) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const actions = useVirtualMCPActions();
  const invalidateEntity = useInvalidateVirtualMcp();

  const fm = parseFreestyleMetadata(virtualMcp.metadata);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [portInput, setPortInput] = useState(
    fm.preview_port != null ? String(fm.preview_port) : "",
  );

  const avatarUrl = fm.repo_url ? getGitHubAvatarUrl(fm.repo_url) : null;
  const scriptEntries = Object.keys(fm.scripts ?? {});
  const isInstalling = fm.runtime_status === "installing";

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      // Stop running script if any
      if (fm.runtime_status === "running") {
        await client
          .callTool({
            name: "VIRTUAL_MCP_STOP_SCRIPT",
            arguments: { virtual_mcp_id: virtualMcp.id },
          })
          .catch(() => {});
      }

      // Clear all freestyle metadata
      await actions.update.mutateAsync({
        id: virtualMcp.id,
        data: {
          metadata: {
            ...virtualMcp.metadata,
            ...emptyFreestyleMetadata(),
          },
        } as Partial<VirtualMCPEntity>,
      });
    } catch (e) {
      console.error("Failed to unlink repo:", e);
    } finally {
      invalidateEntity();
      setUnlinking(false);
      setUnlinkOpen(false);
    }
  };

  const handleUpdateField = async (
    field: string,
    value: string | number | null,
  ) => {
    await actions.update.mutateAsync({
      id: virtualMcp.id,
      data: {
        metadata: {
          ...virtualMcp.metadata,
          [field]: value,
        },
      } as Partial<VirtualMCPEntity>,
    });
    invalidateEntity();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Repository row */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Repository</Label>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/30">
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt=""
              className="size-6 rounded-full shrink-0"
            />
          )}
          <span className="text-sm font-mono text-foreground flex-1 truncate">
            {fm.repo_url}
          </span>
          {isInstalling && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loading01 size={12} className="animate-spin" />
              Installing...
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={isInstalling || unlinking}
            onClick={() => setUnlinkOpen(true)}
          >
            Unlink
          </Button>
        </div>
      </div>

      {/* Runtime */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Runtime</Label>
        <Select
          value={fm.runtime ?? "bun"}
          onValueChange={(v) => handleUpdateField("runtime", v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bun">bun</SelectItem>
            <SelectItem value="deno">deno</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Auto-detected from lockfile
        </p>
      </div>

      {/* Scripts / Tasks (read-only, populated from repo detection) */}
      {scriptEntries.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">
            {fm.runtime === "deno" ? "Tasks" : "Scripts"}
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {scriptEntries.map((name) => (
              <span
                key={name}
                className="px-2 py-0.5 rounded-md border border-border bg-muted/20 text-xs font-mono text-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Autorun */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Autorun</Label>
        <Select
          value={fm.autorun ?? "__none__"}
          onValueChange={(v) =>
            handleUpdateField("autorun", v === "__none__" ? null : v)
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {scriptEntries.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Script to auto-start on VM resume
        </p>
      </div>

      {/* Preview port */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Preview port</Label>
        <Input
          type="number"
          className="w-48"
          placeholder="e.g. 3000"
          min={1}
          max={65535}
          value={portInput}
          onChange={(e) => setPortInput(e.target.value)}
          onBlur={() => {
            const val = portInput.trim();
            if (val === "") {
              handleUpdateField("preview_port", null);
              return;
            }
            const num = Number.parseInt(val, 10);
            if (!Number.isNaN(num) && num >= 1 && num <= 65535) {
              handleUpdateField("preview_port", num);
            } else {
              // Reset to current value on invalid input
              setPortInput(
                fm.preview_port != null ? String(fm.preview_port) : "",
              );
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          Port your dev server listens on
        </p>
      </div>

      {/* Unlink confirmation dialog */}
      <AlertDialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink repository?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect the repo and stop any running VM. You can
              re-link it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlink}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinking ? (
                <>
                  <Loading01 size={14} className="animate-spin" />
                  Unlinking...
                </>
              ) : (
                "Unlink"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
