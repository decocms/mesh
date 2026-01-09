/**
 * Dynamic Plugin Layout
 *
 * Routes to the appropriate plugin layout based on the $pluginId param.
 * Uses the plugin's LayoutComponent if defined, otherwise falls back to Outlet.
 */

import { Outlet, useParams } from "@tanstack/react-router";
import { Suspense } from "react";
import { Loading01 } from "@untitledui/icons";
import { sourcePlugins } from "../plugins";

export default function DynamicPluginLayout() {
  const { pluginId } = useParams({ strict: false }) as { pluginId: string };

  // Find the plugin by ID
  const plugin = sourcePlugins.find((p) => p.id === pluginId);
  const LayoutComponent = plugin?.LayoutComponent;

  if (!LayoutComponent) {
    // No custom layout defined - just render Outlet
    return <Outlet />;
  }

  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-full">
          <Loading01
            size={32}
            className="animate-spin text-muted-foreground mb-4"
          />
          <p className="text-sm text-muted-foreground">Loading plugin...</p>
        </div>
      }
    >
      <LayoutComponent />
    </Suspense>
  );
}
