import type { Route } from "@tanstack/react-router";

export interface Plugin {
  id: string;
  label: string;
  icon: React.ReactNode;
  setupRoutes: (parentRoute: Route) => Route;
}
