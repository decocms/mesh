/**
 * Gateway Templates Plugin - Tools Index
 *
 * Exports all MCP tools for the plugin.
 */

export { GATEWAY_TEMPLATE_CREATE } from "./create";
export { GATEWAY_TEMPLATE_UPDATE } from "./update";
export { GATEWAY_TEMPLATE_DELETE } from "./delete";
export { GATEWAY_TEMPLATE_LIST } from "./list";
export { GATEWAY_TEMPLATE_GET } from "./get";
export { GATEWAY_TEMPLATE_CREATE_SESSION } from "./create-session";
export { GATEWAY_TEMPLATE_LIST_SESSIONS } from "./list-sessions";
export { GATEWAY_TEMPLATE_LIST_USER_AGENTS } from "./list-user-agents";

// Re-export the tools array for plugin registration
import { GATEWAY_TEMPLATE_CREATE } from "./create";
import { GATEWAY_TEMPLATE_UPDATE } from "./update";
import { GATEWAY_TEMPLATE_DELETE } from "./delete";
import { GATEWAY_TEMPLATE_LIST } from "./list";
import { GATEWAY_TEMPLATE_GET } from "./get";
import { GATEWAY_TEMPLATE_CREATE_SESSION } from "./create-session";
import { GATEWAY_TEMPLATE_LIST_SESSIONS } from "./list-sessions";
import { GATEWAY_TEMPLATE_LIST_USER_AGENTS } from "./list-user-agents";

export const tools = [
  GATEWAY_TEMPLATE_CREATE,
  GATEWAY_TEMPLATE_UPDATE,
  GATEWAY_TEMPLATE_DELETE,
  GATEWAY_TEMPLATE_LIST,
  GATEWAY_TEMPLATE_GET,
  GATEWAY_TEMPLATE_CREATE_SESSION,
  GATEWAY_TEMPLATE_LIST_SESSIONS,
  GATEWAY_TEMPLATE_LIST_USER_AGENTS,
];

// Re-export utility for storage initialization
export { setPluginStorage } from "./utils";
