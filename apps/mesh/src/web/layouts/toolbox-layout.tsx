/**
 * Toolbox Layout
 *
 * Nested layout for toolbox focus mode.
 * Provides the toolbox context for child routes.
 * Note: This is a simple wrapper that provides context.
 * The shell layout handles the sidebar/topbar rendering.
 */

import { SplashScreen } from "@/web/components/splash-screen";
import { useGateway } from "@/web/hooks/collections/use-gateway";
import { ToolboxContextProvider } from "@/web/providers/toolbox-context-provider";
import { Outlet, useParams } from "@tanstack/react-router";
import { Suspense } from "react";

function ToolboxLayoutContent() {
  const { toolboxId } = useParams({ strict: false });
  const toolbox = useGateway(toolboxId);

  // If no toolbox found, show loading
  if (!toolbox) {
    return <SplashScreen />;
  }

  return (
    <ToolboxContextProvider toolbox={toolbox}>
      <Outlet />
    </ToolboxContextProvider>
  );
}

export default function ToolboxLayout() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <ToolboxLayoutContent />
    </Suspense>
  );
}
