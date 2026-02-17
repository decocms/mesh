/**
 * BindingSelector Component
 *
 * A reusable connection selector that filters connections by binding.
 * Shows connection icons and supports inline installation from registry.
 * When running locally, offers a "Choose local folder" option that creates
 * a @modelcontextprotocol/server-filesystem STDIO connection.
 */

import {
  useConnections,
  useConnectionActions,
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useInstallFromRegistry } from "@/web/hooks/use-install-from-registry";
import { Folder, Loading01, Plus } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useState } from "react";
import type { Binder } from "@decocms/bindings";
import { connectionImplementsBinding } from "@/web/hooks/use-binding";

export interface BindingSelectorProps {
  /** Currently selected connection ID */
  value: string | null;
  /** Callback when selection changes */
  onValueChange: (value: string | null) => void;
  /** Placeholder text when no selection */
  placeholder?: string;
  /**
   * Binding filter - can be:
   * - A well-known binding name string (e.g., "LLMS", "MCP")
   * - A Binder (zod-based binding from plugin)
   */
  binding?: string | Binder;
  /**
   * Binding type for registry installation (e.g., "@scope/app-name")
   * If provided, enables inline installation from registry
   */
  bindingType?: string;
  /** Callback for custom "Add New" action */
  onAddNew?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

export function BindingSelector({
  value,
  onValueChange,
  placeholder = "Select a connection...",
  binding,
  bindingType,
  onAddNew,
  className,
  disabled = false,
}: BindingSelectorProps) {
  const [isLocalInstalling, setIsLocalInstalling] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const { installByBinding, isInstalling: isGlobalInstalling } =
    useInstallFromRegistry();

  const isInstalling = isLocalInstalling || isGlobalInstalling;

  const { org } = useProjectContext();
  const { create } = useConnectionActions();
  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const allConnections = useConnections();

  // Filter connections based on binding type
  // Use the hook for string bindings
  const hookFilteredConnections = useBindingConnections({
    connections: allConnections,
    binding: typeof binding === "string" ? binding : undefined,
  });

  const filteredConnections = (() => {
    if (!binding || !allConnections) return allConnections ?? [];

    // If it's a string binding (well-known name), use the hook result
    if (typeof binding === "string") {
      return hookFilteredConnections;
    }

    // If it's a Binder (array with zod schemas), filter using connectionImplementsBinding
    if (Array.isArray(binding) && binding.length > 0) {
      return allConnections.filter((conn) =>
        connectionImplementsBinding(conn, binding),
      );
    }

    return allConnections;
  })();

  // Parse binding type for registry-based filtering
  const parsedBindingType = (() => {
    if (!bindingType?.startsWith("@")) return null;
    const [scope, appName] = bindingType.replace("@", "").split("/");
    return scope && appName ? { scope, appName } : null;
  })();

  // Further filter by app name if bindingType is provided
  const connections = (() => {
    let result = filteredConnections;

    // If we have a Binder, we've already filtered by tools - don't further filter by app name
    const hasBinderFilter = Array.isArray(binding) && binding.length > 0;

    if (parsedBindingType && !hasBinderFilter) {
      result = result.filter((conn) => {
        const connAppName = conn.app_name;
        const connScopeName = (conn.metadata as Record<string, unknown> | null)
          ?.scopeName as string | undefined;

        return (
          connAppName === parsedBindingType.appName &&
          connScopeName === parsedBindingType.scope
        );
      });
    }

    // Include currently selected connection even if it doesn't match filters
    if (value && !result.some((c) => c.id === value)) {
      const selectedConnection = allConnections?.find((c) => c.id === value);
      if (selectedConnection) {
        return [selectedConnection, ...result];
      }
    }

    return result;
  })();

  const canInstallInline = bindingType?.startsWith("@");

  const handleCreateConnection = async () => {
    if (canInstallInline && bindingType) {
      setIsLocalInstalling(true);
      try {
        // installByBinding handles error notifications globally via mutation hooks
        const result = await installByBinding(bindingType);
        if (result) {
          onValueChange(result.id);
        }
      } finally {
        setIsLocalInstalling(false);
      }
      return;
    }

    onAddNew?.();
  };

  // Detect if binding requires object storage tools (LIST_OBJECTS, GET_PRESIGNED_URL, etc.)
  const isObjectStorageBinding = (() => {
    if (!binding) return false;
    if (typeof binding === "string") {
      return binding === "OBJECT_STORAGE";
    }
    if (Array.isArray(binding)) {
      return binding.some(
        (b) =>
          b.name === "LIST_OBJECTS" ||
          b.name === "GET_PRESIGNED_URL" ||
          b.name === "PUT_PRESIGNED_URL",
      );
    }
    return false;
  })();

  // Virtual connection ID for dev-assets (local object storage routed through mesh)
  const devAssetsConnectionId = `${org.id}_dev-assets`;

  const handleChooseLocalFolder = async () => {
    setIsBrowsing(true);
    try {
      // Open native OS folder picker via the mesh server
      const pickResult = (await selfClient.callTool({
        name: "FILESYSTEM_PICK_DIRECTORY",
        arguments: {},
      })) as { structuredContent?: { path: string | null } };

      const folderPath = pickResult.structuredContent?.path ?? null;
      if (!folderPath) return;

      const folderName =
        folderPath.split("/").filter(Boolean).pop() ?? "folder";

      // For object storage bindings, use the local-object-storage bridge
      // For file/site bindings, use the standard filesystem MCP
      const connectionConfig = isObjectStorageBinding
        ? {
            title: `Local Files: ${folderName}`,
            connection_type: "STDIO" as const,
            connection_headers: {
              command: "node",
              args: [
                "--experimental-strip-types",
                "../../packages/mcp-local-object-storage/src/index.ts",
                folderPath,
              ],
            },
          }
        : {
            title: `Local: ${folderName}`,
            connection_type: "STDIO" as const,
            connection_headers: {
              command: "npx",
              args: [
                "-y",
                "@modelcontextprotocol/server-filesystem",
                folderPath,
              ],
            },
          };

      const newConnection = await create.mutateAsync(
        connectionConfig as Parameters<typeof create.mutateAsync>[0],
      );

      onValueChange(newConnection.id);
    } catch {
      // Error is handled by the mutation toast
    } finally {
      setIsBrowsing(false);
    }
  };

  const busy = isInstalling || isBrowsing;

  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => onValueChange(v === "none" ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className={cn("w-[200px]", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No connection</SelectItem>
        {isObjectStorageBinding && (
          <SelectItem value={devAssetsConnectionId}>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Folder size={16} />
                <span>Local Storage</span>
              </div>
              <span className="text-xs text-muted-foreground ml-6">
                Store in your browser
              </span>
            </div>
          </SelectItem>
        )}
        {connections.length === 0 && !isObjectStorageBinding ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No compatible connections found
          </div>
        ) : (
          connections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>
              <div className="flex items-center gap-2">
                {connection.icon ? (
                  <img
                    src={connection.icon}
                    alt={connection.title}
                    className="w-4 h-4 rounded"
                  />
                ) : (
                  <div className="w-4 h-4 rounded bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {connection.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span>{connection.title}</span>
              </div>
            </SelectItem>
          ))
        )}
        <div className="border-t border-border flex flex-col">
          {/* Choose local folder - always available when running locally */}
          <Button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleChooseLocalFolder();
            }}
            disabled={busy || disabled}
            variant="ghost"
            className="w-full justify-start gap-2 px-2 py-2 h-auto hover:bg-muted rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            {isBrowsing ? (
              <>
                <Loading01 size={16} className="animate-spin" />
                <span>Selecting folder...</span>
              </>
            ) : (
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-2">
                  <Folder size={16} />
                  <span>Local Files</span>
                </div>
                <span className="text-xs text-muted-foreground ml-6">
                  Store in your files
                </span>
              </div>
            )}
          </Button>
          {/* Add connection / install from registry */}
          {(onAddNew || canInstallInline) && (
            <Button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateConnection();
              }}
              disabled={busy || disabled}
              variant="ghost"
              className="w-full justify-start gap-2 px-2 py-2 h-auto hover:bg-muted rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {isInstalling ? (
                <>
                  <Loading01 size={16} className="animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>Custom Connection</span>
                </>
              )}
            </Button>
          )}
        </div>
      </SelectContent>
    </Select>
  );
}
