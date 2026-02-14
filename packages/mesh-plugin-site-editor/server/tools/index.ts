/**
 * Site Editor Server Tools
 *
 * Page CRUD tools for managing CMS pages stored in .deco/pages/.
 */

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { PAGE_LIST } from "./page-list";
import { PAGE_GET } from "./page-get";
import { PAGE_CREATE } from "./page-create";
import { PAGE_UPDATE } from "./page-update";
import { PAGE_DELETE } from "./page-delete";

export const tools: ServerPluginToolDefinition[] = [
  PAGE_LIST,
  PAGE_GET,
  PAGE_CREATE,
  PAGE_UPDATE,
  PAGE_DELETE,
];
