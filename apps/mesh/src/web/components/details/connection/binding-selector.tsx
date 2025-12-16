import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Icon } from "@deco/ui/components/icon.tsx";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { useInstallFromRegistry } from "@/web/hooks/use-install-from-registry";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useBindingConnections } from "@/web/hooks/use-binding";

interface BindingSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /**
   * Binding filter - can be a well-known binding name (e.g., "LLMS", "AGENTS", "MCP")
   * or a custom binding schema array for filtering connections.
   * Note: String values are case-insensitive (e.g., "llms" works the same as "LLMS").
   */
  binding?:
    | string
    | Array<{
        name: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>;
  /**
   * Specific MCP binding type for inline installation (e.g., "@deco/database").
   * When provided and starts with "@", clicking "Create connection" will
   * attempt to install the MCP directly from the registry.
   */
  bindingType?: string;
  /** Callback when "Create connection" is clicked (fallback when no bindingType) */
  onAddNew?: () => void;
  /** Optional className for the trigger */
  className?: string;
}

export function BindingSelector({
  value,
  onValueChange,
  placeholder = "Select a connection...",
  binding,
  bindingType,
  onAddNew,
  className,
}: BindingSelectorProps) {
  const [isLocalInstalling, setIsLocalInstalling] = useState(false);
  const { installByBinding, isInstalling: isGlobalInstalling } =
    useInstallFromRegistry();

  const isInstalling = isLocalInstalling || isGlobalInstalling;

  // Fetch all connections from local collection
  const allConnections = useConnections();

  // Filter connections by binding (works with both well-known binding names and inline binding schemas)
  const filteredConnections = useBindingConnections({
    connections: allConnections,
    binding: binding,
  });

  const parsedBindingType = (() => {
    if (!bindingType?.startsWith("@")) return null;
    const [scope, appName] = bindingType.replace("@", "").split("/");
    return scope && appName ? { scope, appName } : null;
  })();

  // Apply additional filtering by bindingType and include selected connection if not in filtered list
  const connections = (() => {
    let result = filteredConnections;

    // Only filter by app_name/scopeName if:
    // 1. We have a parsedBindingType (@scope/appName format)
    // 2. AND we don't have a binding schema (tools array) for filtering
    // When we have a binding schema, the tools-based filtering is sufficient
    const hasBindingSchema = Array.isArray(binding) && binding.length > 0;

    if (parsedBindingType && !hasBindingSchema) {
      result = result.filter((conn) => {
        const connAppName = conn.app_name;
        const connScopeName = (conn.metadata as Record<string, unknown> | null)
          ?.scopeName as string | undefined;

        // Match by app_name and scopeName
        return (
          connAppName === parsedBindingType.appName &&
          connScopeName === parsedBindingType.scope
        );
      });
    }

    if (value && !result.some((c) => c.id === value)) {
      const selectedConnection = allConnections?.find((c) => c.id === value);
      if (selectedConnection) {
        return [selectedConnection, ...result];
      }
    }

    return result;
  })();

  // Check if we can do inline installation (bindingType starts with @)
  const canInstallInline = bindingType?.startsWith("@");

  const handleCreateConnection = async () => {
    // If we have a specific binding type that starts with @, try inline installation
    if (canInstallInline && bindingType) {
      setIsLocalInstalling(true);
      try {
        const result = await installByBinding(bindingType);
        if (result) {
          // Automatically select the newly installed connection
          // The connection will appear in the list via allConnections
          onValueChange(result.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to install connection: ${message}`);
      } finally {
        setIsLocalInstalling(false);
      }
      return;
    }

    // Fallback to onAddNew navigation
    onAddNew?.();
  };

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className ?? "w-[200px] h-8!"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {connections.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No connections found
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
                  <div className="w-4 h-4 rounded bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {connection.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span>{connection.title}</span>
              </div>
            </SelectItem>
          ))
        )}
        {(onAddNew || canInstallInline) && (
          <div className="border-t border-border">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateConnection();
              }}
              disabled={isInstalling}
              className="w-full flex items-center gap-2 px-2 py-2 hover:bg-muted rounded-md text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInstalling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Installing...</span>
                </>
              ) : (
                <>
                  <Icon name="add" size={16} />
                  <span>
                    {canInstallInline ? "Install MCP" : "Create connection"}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
