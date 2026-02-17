/**
 * Dynamic Plugin Layout
 *
 * Routes to the appropriate plugin layout based on the $pluginId param.
 * Uses the plugin's renderHeader/renderEmptyState if defined, otherwise falls back to Outlet.
 */

import type { Binder } from "@decocms/bindings";
import type { ClientPlugin } from "@decocms/bindings/plugins";
import { Outlet, useLocation, useParams } from "@tanstack/react-router";
import { Suspense } from "react";
import { Loading01 } from "@untitledui/icons";
import { sourcePlugins } from "../plugins";
import { PluginLayout } from "./plugin-layout";

/**
 * Extracts the pluginId from URL params (catch-all $pluginId route) or from
 * the pathname (per-plugin static routes like /site-editor, /object-storage).
 * The pluginId is always the 3rd path segment: /$org/$project/$pluginId/...
 */
function usePluginId(): string {
  const params = useParams({ strict: false }) as { pluginId?: string };
  const location = useLocation();
  if (params.pluginId) return params.pluginId;
  const segments = location.pathname.split("/").filter(Boolean);
  return segments[2] ?? "";
}

export default function DynamicPluginLayout() {
  const pluginId = usePluginId();

  // Find the plugin by ID
  const plugin = sourcePlugins.find((p) => p.id === pluginId);

  // If plugin has render props and a binding, use PluginLayout with those
  if (plugin?.renderHeader && plugin?.renderEmptyState && plugin?.binding) {
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
        <PluginLayoutWithOverride plugin={plugin} />
      </Suspense>
    );
  }

  // Fallback: legacy LayoutComponent or just Outlet
  const LayoutComponent = plugin?.LayoutComponent;
  if (!LayoutComponent) {
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

/**
 * Wrapper that calls plugin.useConnectionId() (if defined) to provide
 * a connectionIdOverride to PluginLayout. Separated into its own component
 * because hooks must be called at the top level of a React component.
 */
function PluginLayoutWithOverride({
  plugin,
}: {
  plugin: ClientPlugin<Binder>;
}) {
  const connectionIdOverride = plugin.useConnectionId
    ? plugin.useConnectionId()
    : undefined;

  return (
    <PluginLayout
      binding={plugin.binding!}
      renderHeader={plugin.renderHeader!}
      renderEmptyState={plugin.renderEmptyState!}
      connectionIdOverride={connectionIdOverride}
    />
  );
}
