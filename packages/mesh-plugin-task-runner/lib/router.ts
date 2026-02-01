/**
 * Task Runner Plugin Router
 *
 * Provides typed routing utilities for the task runner plugin.
 */

import { createPluginRouter } from "@decocms/bindings/plugins";
import * as z from "zod";

/**
 * Search schema for the task board route.
 */
const taskBoardSearchSchema = z.object({
  view: z.enum(["board", "list"]).optional().default("board"),
  filter: z
    .enum(["all", "ready", "in_progress", "blocked"])
    .optional()
    .default("all"),
});

export type TaskBoardSearch = z.infer<typeof taskBoardSearchSchema>;

/**
 * Plugin router with typed hooks for navigation and search params.
 */
export const taskRunnerRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  const indexRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/task-board")),
    validateSearch: taskBoardSearchSchema,
  });

  return [indexRoute];
});
