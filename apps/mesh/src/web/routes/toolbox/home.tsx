/**
 * Toolbox Home Page
 *
 * Displays a scoped chat experience for the current toolbox.
 * The chat is pre-configured to use this toolbox's gateway.
 */

import { FullPageChat } from "@/web/components/chat/full-page-chat";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { SplashScreen } from "@/web/components/splash-screen";
import { useToolboxContext } from "@/web/providers/toolbox-context-provider";
import { Suspense } from "react";

function ToolboxHomeContent() {
  const { toolbox } = useToolboxContext();

  return (
    <FullPageChat
      gatewayId={toolbox.id}
      hideGatewaySelector
      greeting={`Ask ${toolbox.title}`}
    />
  );
}

export default function ToolboxHome() {
  return (
    <div className="h-full w-full">
      <ErrorBoundary>
        <Suspense fallback={<SplashScreen />}>
          <ToolboxHomeContent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
