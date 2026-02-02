/**
 * Preview Frame Component
 *
 * Shows a live preview of the Deco site in an iframe with URL bar and controls.
 */

import { useState } from "react";
import {
  RefreshCw01,
  Expand01,
  Monitor01,
  Phone01,
  Tablet01,
  XClose,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";

export interface PreviewFrameProps {
  url: string;
  onClose?: () => void;
}

type DeviceMode = "desktop" | "tablet" | "mobile";

const deviceDimensions: Record<DeviceMode, { width: string; label: string }> = {
  desktop: { width: "100%", label: "Desktop" },
  tablet: { width: "768px", label: "Tablet" },
  mobile: { width: "375px", label: "Mobile" },
};

export function PreviewFrame({ url, onClose }: PreviewFrameProps) {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [key, setKey] = useState(0);

  const handleRefresh = () => {
    setKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    window.open(url, "_blank");
  };

  return (
    <div className="flex flex-col h-full bg-muted/30 border border-border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
        {/* URL Bar */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
          <span className="text-muted-foreground truncate">{url}</span>
        </div>

        {/* Device Mode Buttons */}
        <div className="flex items-center border border-border rounded-md">
          <button
            type="button"
            onClick={() => setDeviceMode("desktop")}
            className={cn(
              "p-1.5 transition-colors",
              deviceMode === "desktop"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
            title="Desktop view"
          >
            <Monitor01 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode("tablet")}
            className={cn(
              "p-1.5 transition-colors border-l border-border",
              deviceMode === "tablet"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
            title="Tablet view"
          >
            <Tablet01 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode("mobile")}
            className={cn(
              "p-1.5 transition-colors border-l border-border",
              deviceMode === "mobile"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
            title="Mobile view"
          >
            <Phone01 size={16} />
          </button>
        </div>

        {/* Action Buttons */}
        <button
          type="button"
          onClick={handleRefresh}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          title="Refresh"
        >
          <RefreshCw01 size={16} />
        </button>
        <button
          type="button"
          onClick={handleOpenExternal}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          title="Open in new tab"
        >
          <Expand01 size={16} />
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Close preview"
          >
            <XClose size={16} />
          </button>
        )}
      </div>

      {/* Iframe Container */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div
          className={cn(
            "bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-200",
            deviceMode !== "desktop" && "border border-border",
          )}
          style={{
            width: deviceDimensions[deviceMode].width,
            height: deviceMode === "desktop" ? "100%" : "80%",
            maxWidth: "100%",
          }}
        >
          <iframe
            key={key}
            src={url}
            title="Site Preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
    </div>
  );
}
