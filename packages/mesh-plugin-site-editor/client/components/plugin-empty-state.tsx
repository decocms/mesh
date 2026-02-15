/**
 * Plugin Empty State Component
 *
 * Shown when no site connections are available or configured.
 * Provides an inline setup wizard to connect a local project folder.
 */

import { Folder } from "@untitledui/icons";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  useConnectionActions,
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
  KEYS,
  Locator,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";

export default function PluginEmptyState() {
  const [path, setPath] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { org, project } = useProjectContext();
  const { pluginId } = useParams({ strict: false }) as { pluginId: string };
  const { create } = useConnectionActions();
  const queryClient = useQueryClient();

  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const handleBrowse = async () => {
    setIsBrowsing(true);
    setError(null);
    try {
      const result = (await selfClient.callTool({
        name: "FILESYSTEM_PICK_DIRECTORY",
        arguments: {},
      })) as { structuredContent?: { path: string | null } };

      const selected =
        (result.structuredContent?.path as string | null) ?? null;
      if (selected) {
        setPath(selected);
      }
    } catch {
      setError("Could not open folder picker");
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = path.trim();
    if (!trimmed) return;

    setIsConnecting(true);
    setError(null);

    try {
      const folderName = trimmed.split("/").filter(Boolean).pop() ?? "site";

      // 1. Create the STDIO connection
      const newConnection = await create.mutateAsync({
        title: `Site: ${folderName}`,
        connection_type: "STDIO",
        connection_headers: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", trimmed],
        },
      } as Parameters<typeof create.mutateAsync>[0]);

      // 2. Bind the new connection to this plugin via project config
      await selfClient.callTool({
        name: "PROJECT_PLUGIN_CONFIG_UPDATE",
        arguments: {
          projectId: project.id,
          pluginId,
          connectionId: newConnection.id,
        },
      });

      // 3. Invalidate queries so PluginLayout re-renders with the connection
      const locator = Locator.from({
        org: org.slug,
        project: project.slug ?? "",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: KEYS.connections(locator),
        }),
        queryClient.invalidateQueries({
          queryKey: ["project-plugin-config", project.id, pluginId],
        }),
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create connection",
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const busy = isConnecting || isBrowsing;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <form
        onSubmit={handleConnect}
        className="flex flex-col items-center gap-4 w-full max-w-md"
      >
        {/* Clickable browse area */}
        <button
          type="button"
          onClick={handleBrowse}
          disabled={busy}
          className="flex flex-col items-center gap-3 p-8 w-full border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-muted-foreground/50 hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Folder size={48} className="text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-lg font-medium">Connect your site</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {isBrowsing
                ? "Opening folder picker..."
                : "Click to select a folder"}
            </p>
          </div>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">
            or enter path manually
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Manual path input */}
        <Input
          ref={inputRef}
          type="text"
          placeholder="/Users/you/Projects/my-site"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={busy}
          className="w-full"
        />

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button type="submit" disabled={!path.trim() || busy}>
          {isConnecting ? "Connecting..." : "Connect"}
        </Button>
      </form>
    </div>
  );
}
