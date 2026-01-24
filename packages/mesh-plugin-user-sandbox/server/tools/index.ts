/**
 * User Sandbox Plugin - Tools Index
 *
 * Exports all MCP tools for the plugin.
 */

// Re-export the tools array for plugin registration
import { USER_SANDBOX_CREATE } from "./create";
import { USER_SANDBOX_UPDATE } from "./update";
import { USER_SANDBOX_DELETE } from "./delete";
import { USER_SANDBOX_LIST } from "./list";
import { USER_SANDBOX_GET } from "./get";
import { USER_SANDBOX_CREATE_SESSION } from "./create-session";
import { USER_SANDBOX_LIST_SESSIONS } from "./list-sessions";
import { USER_SANDBOX_LIST_USER_AGENTS } from "./list-user-agents";
import { USER_SANDBOX_CLEAR_USER_SESSION } from "./clear-user-session";

export const tools = [
  USER_SANDBOX_CREATE,
  USER_SANDBOX_UPDATE,
  USER_SANDBOX_DELETE,
  USER_SANDBOX_LIST,
  USER_SANDBOX_GET,
  USER_SANDBOX_CREATE_SESSION,
  USER_SANDBOX_LIST_SESSIONS,
  USER_SANDBOX_LIST_USER_AGENTS,
  USER_SANDBOX_CLEAR_USER_SESSION,
];

// Re-export utility for storage initialization
export { setPluginStorage } from "./utils";
