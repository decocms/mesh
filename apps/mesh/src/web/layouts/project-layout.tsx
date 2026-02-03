import { Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { SplashScreen } from "@/web/components/splash-screen";

// Placeholder until Task 001 storage is ready
// Once storage exists, fetch project data and provide via context

export default function ProjectLayout() {
  // For now, just pass through.
  // In Task 004, this will:
  // 1. Fetch project data from storage
  // 2. Provide ProjectContext
  // 3. Handle loading states

  return (
    <Suspense fallback={<SplashScreen />}>
      <Outlet />
    </Suspense>
  );
}
