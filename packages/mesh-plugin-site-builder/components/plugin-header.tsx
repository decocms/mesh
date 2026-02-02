/**
 * Plugin Header Component
 *
 * Connection selector with Deco site detection badges.
 */

import type { PluginRenderHeaderProps } from "@decocms/bindings/plugins";
import { Globe01, ChevronDown, Check } from "@untitledui/icons";
import { useState, useRef } from "react";
import { useSiteDetection } from "../hooks/use-site-detection";
import { usePluginContext } from "@decocms/bindings/plugins";
import { SITE_BUILDER_BINDING } from "../lib/binding";

/**
 * Badge to show Deco site detection status
 */
function SiteBadge({ connectionId }: { connectionId: string }) {
  const { connectionId: currentConnectionId } =
    usePluginContext<typeof SITE_BUILDER_BINDING>();

  // Only fetch detection if this is the current connection
  const { data: detection } = useSiteDetection();
  const isCurrentConnection = connectionId === currentConnectionId;

  if (!isCurrentConnection) {
    return null;
  }

  if (!detection) {
    return null;
  }

  if (detection.isDeco) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-green-500/10 text-green-600 dark:text-green-400">
        Deco
      </span>
    );
  }

  if (detection.hasDenoJson) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
        Deno
      </span>
    );
  }

  return null;
}

/**
 * Simple dropdown menu for connection selection with site detection.
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

  const handleBlur = (e: React.FocusEvent) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
    }
  };

  if (connections.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Globe01 size={16} />
        <span>No sites connected</span>
      </div>
    );
  }

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
          <Globe01 size={16} />
        )}
        <span>{selectedConnection?.title || "Site Builder"}</span>
        {selectedConnection && (
          <SiteBadge connectionId={selectedConnection.id} />
        )}
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
          <Globe01 size={16} />
        )}
        <span>{selectedConnection?.title || "Select site"}</span>
        {selectedConnection && (
          <SiteBadge connectionId={selectedConnection.id} />
        )}
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
                <Globe01 size={16} />
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
