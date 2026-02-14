/**
 * Site Editor Server Tools
 *
 * Page CRUD tools for managing CMS pages stored in .deco/pages/.
 * Block scanner and management tools for .deco/blocks/.
 */

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { PAGE_LIST } from "./page-list";
import { PAGE_GET } from "./page-get";
import { PAGE_CREATE } from "./page-create";
import { PAGE_UPDATE } from "./page-update";
import { PAGE_DELETE } from "./page-delete";
import { BLOCK_SCAN } from "./block-scan";
import { BLOCK_LIST } from "./block-list";
import { BLOCK_GET } from "./block-get";
import { BLOCK_REGISTER } from "./block-register";

export const tools: ServerPluginToolDefinition[] = [
  PAGE_LIST,
  PAGE_GET,
  PAGE_CREATE,
  PAGE_UPDATE,
  PAGE_DELETE,
  BLOCK_SCAN,
  BLOCK_LIST,
  BLOCK_GET,
  BLOCK_REGISTER,
];
