/**
 * BindingSelector Component
 *
 * A reusable connection selector that filters connections by binding.
 * Shows connection icons and supports inline installation from registry.
 */

import { useConnections } from "@decocms/mesh-sdk";
import { useInstallFromRegistry } from "@/web/hooks/use-install-from-registry";
import { Loading01, Plus } from "@untitledui/icons";
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

export interface BindingSelectorProps {
  /** Currently selected connection ID */
  value: string | null;
  /** Callback when selection changes */
  onValueChange: (value: string | null) => void;
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Well-known binding name string (e.g., "LLMS", "MCP") for server-side filtering */
  binding: string;
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
  const { installByBinding, isInstalling: isGlobalInstalling } =
    useInstallFromRegistry();

  const isInstalling = isLocalInstalling || isGlobalInstalling;

  // Parse binding type for registry-based filtering
  const parsedBindingType = (() => {
    if (!bindingType?.startsWith("@")) return null;
    const [scope, appName] = bindingType.replace("@", "").split("/");
    return scope && appName ? { scope, appName } : null;
  })();

  // Build server-side filters for app_name and metadata.scopeName
  const bindingFilters = parsedBindingType
    ? [
        {
          column: "app_name" as const,
          value: parsedBindingType.appName,
        },
        {
          column: "metadata.scopeName" as const,
          value: parsedBindingType.scope,
        },
      ]
    : undefined;

  const allConnections = useConnections({ binding, filters: bindingFilters });

  // Include currently selected connection even if it doesn't match filters
  const connections = (() => {
    if (value && !allConnections.some((c) => c.id === value)) {
      const selectedConnection = allConnections?.find((c) => c.id === value);
      if (selectedConnection) {
        return [selectedConnection, ...allConnections];
      }
    }

    return allConnections;
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

  // Get selected connection for display
  const selectedConnection = connections.find((c) => c.id === value);

  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => onValueChange(v === "none" ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className={cn("w-[200px]", className)}>
        <SelectValue placeholder={placeholder}>
          {selectedConnection ? (
            <div className="flex items-center gap-2">
              {selectedConnection.icon ? (
                <img
                  src={selectedConnection.icon}
                  alt={selectedConnection.title}
                  className="w-4 h-4 rounded shrink-0"
                />
              ) : (
                <div className="w-4 h-4 rounded bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {selectedConnection.title.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="truncate">{selectedConnection.title}</span>
            </div>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No connection</SelectItem>
        {connections.length === 0 ? (
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
        {(onAddNew || canInstallInline) && (
          <div className="border-t border-border">
            <Button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateConnection();
              }}
              disabled={isInstalling || disabled}
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
                  <span>Add Connection</span>
                </>
              )}
            </Button>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
