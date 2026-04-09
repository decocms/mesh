/**
 * Organization Management Tools
 *
 * Wraps Better Auth organization plugin APIs as MCP tools
 */

export { ORGANIZATION_CREATE } from "./create";
export { ORGANIZATION_LIST } from "./list";
export { ORGANIZATION_GET } from "./get";
export { ORGANIZATION_UPDATE } from "./update";
export { ORGANIZATION_DELETE } from "./delete";
export { ORGANIZATION_SETTINGS_GET } from "./settings-get";
export { ORGANIZATION_SETTINGS_UPDATE } from "./settings-update";
export { BRAND_CONTEXT_LIST, BRAND_CONTEXT_GET } from "./brand-context-get";
export {
  BRAND_CONTEXT_CREATE,
  BRAND_CONTEXT_UPDATE,
  BRAND_CONTEXT_DELETE,
} from "./brand-context-update";
export { BRAND_CONTEXT_EXTRACT } from "./brand-context-extract";

// Domain management
export { ORGANIZATION_DOMAIN_GET } from "./domain-get";
export {
  ORGANIZATION_DOMAIN_SET,
  ORGANIZATION_DOMAIN_UPDATE,
  ORGANIZATION_DOMAIN_CLEAR,
} from "./domain-set";

// Member management
export { ORGANIZATION_MEMBER_ADD } from "./member-add";
export { ORGANIZATION_MEMBER_REMOVE } from "./member-remove";
export { ORGANIZATION_MEMBER_LIST } from "./member-list";
export { ORGANIZATION_MEMBER_UPDATE_ROLE } from "./member-update-role";
