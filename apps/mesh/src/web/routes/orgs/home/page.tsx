/**
 * Organization Home Page
 *
 * Displays a full-page chat experience as the main home interface.
 */

import { FullPageChat } from "@/web/components/chat/full-page-chat";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { SplashScreen } from "@/web/components/splash-screen";
import { Suspense } from "react";

export default function OrgHomePage() {
  return (
    <div className="h-full w-full">
      <ErrorBoundary>
        <Suspense fallback={<SplashScreen />}>
          <FullPageChat />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
