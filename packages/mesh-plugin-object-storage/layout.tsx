/**
 * Object Storage Plugin Layout
 *
 * Provides the layout wrapper for the file browser plugin.
 * Uses PluginLayout for consistent connection selection.
 */

import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { PluginLayout } from "../../apps/mesh/src/web/layouts/plugin-layout";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { Folder, ChevronDown, Check } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";

interface ConnectionSelectorProps {
  connections: ConnectionEntity[];
  selectedConnectionId: string;
  onConnectionChange: (connectionId: string) => void;
}

function ConnectionSelector({
  connections,
  selectedConnectionId,
  onConnectionChange,
}: ConnectionSelectorProps) {
  const selectedConnection = connections.find(
    (c) => c.id === selectedConnectionId,
  );

  if (connections.length === 1) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {selectedConnection?.icon ? (
          <img
            src={selectedConnection.icon}
            alt=""
            className="size-4 rounded"
          />
        ) : (
          <Folder size={16} />
        )}
        <span>{selectedConnection?.title || "Storage"}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {selectedConnection?.icon ? (
            <img
              src={selectedConnection.icon}
              alt=""
              className="size-4 rounded"
            />
          ) : (
            <Folder size={16} />
          )}
          <span>{selectedConnection?.title || "Select storage"}</span>
          <ChevronDown size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {connections.map((connection) => (
          <DropdownMenuItem
            key={connection.id}
            onClick={() => onConnectionChange(connection.id)}
          >
            <div className="flex items-center gap-2 w-full">
              {connection.icon ? (
                <img src={connection.icon} alt="" className="size-4 rounded" />
              ) : (
                <Folder size={16} />
              )}
              <span className="flex-1">{connection.title}</span>
              {connection.id === selectedConnectionId && (
                <Check size={14} className="text-primary" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Folder size={48} className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No storage connected</h3>
      <p className="text-muted-foreground text-center max-w-md">
        Connect an S3-compatible storage service to browse and manage files.
      </p>
    </div>
  );
}

export default function ObjectStoragePluginLayout() {
  return (
    <PluginLayout
      binding={OBJECT_STORAGE_BINDING}
      renderHeader={({
        connections,
        selectedConnectionId,
        onConnectionChange,
      }) => (
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <ConnectionSelector
            connections={connections}
            selectedConnectionId={selectedConnectionId}
            onConnectionChange={onConnectionChange}
          />
        </div>
      )}
      renderEmptyState={() => <EmptyState />}
    />
  );
}
