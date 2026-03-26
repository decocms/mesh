/**
 * Org Layout
 *
 * Wraps all org-level routes. The shell-level ProjectContextProvider
 * already provides the complete org context (including enabledPlugins).
 */

import { Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { SplashScreen } from "@/web/components/splash-screen";

export default function OrgLayout() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <Outlet />
    </Suspense>
  );
}
