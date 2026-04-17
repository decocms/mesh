/**
 * TasksPanel — left-panel entry point for the unified chat layout.
 *
 * Thin wrapper around the existing `TasksSidePanel` implementation, which
 * renders the project header, pinned views, new-task button, and task list.
 * Lives under `layouts/` as the canonical layout-level surface so that
 * future refactors (cross-agent list, inline filters) can evolve this file
 * without touching the component internals.
 */
export { TasksSidePanel as TasksPanel } from "@/web/components/chat/side-panel-tasks";
export { statusVerb } from "./status-verb";
