/**
 * Plugin Header Component
 *
 * Connection selector for the object storage plugin.
 * Uses native HTML elements to avoid type conflicts with UI package.
 */

import type { PluginRenderHeaderProps } from "@decocms/bindings/plugins";
import { Folder, ChevronDown, Check } from "@untitledui/icons";
import { useState, useRef } from "react";

/**
 * Simple dropdown menu using native elements.
 */
function ConnectionSelector({
  connections,
  selectedConnectionId,
  onConnectionChange,
}: PluginRenderHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedConnection = connections.find(
    (c) => c.id === selectedConnectionId,
  );

  // Close dropdown when clicking outside
  const handleBlur = (e: React.FocusEvent) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
    }
  };

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
    <div className="relative" ref={dropdownRef} onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
      >
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
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-48 rounded-md border border-border bg-popover p-1 shadow-md">
          {connections.map((connection) => (
            <button
              key={connection.id}
              type="button"
              onClick={() => {
                onConnectionChange(connection.id);
                setIsOpen(false);
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors"
            >
              {connection.icon ? (
                <img src={connection.icon} alt="" className="size-4 rounded" />
              ) : (
                <Folder size={16} />
              )}
              <span className="flex-1 text-left">{connection.title}</span>
              {connection.id === selectedConnectionId && (
                <Check size={14} className="text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PluginHeader(props: PluginRenderHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border">
      <ConnectionSelector {...props} />
    </div>
  );
}
