/**
 * Site Editor Server Tools
 *
 * Page CRUD tools for managing CMS pages stored in .deco/pages/.
 * Block scanner and management tools for .deco/blocks/.
 * Loader scanner and management tools for .deco/loaders/.
 * Branch lifecycle tools for draft/publish workflow.
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
import { LOADER_SCAN } from "./loader-scan";
import { LOADER_LIST } from "./loader-list";
import { LOADER_GET } from "./loader-get";
import { BRANCH_LIST } from "./branch-list";
import { BRANCH_CREATE } from "./branch-create";
import { BRANCH_MERGE } from "./branch-merge";
import { BRANCH_DELETE } from "./branch-delete";
import { FILE_HISTORY, FILE_READ_AT } from "./page-history";

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
  LOADER_SCAN,
  LOADER_LIST,
  LOADER_GET,
  BRANCH_LIST,
  BRANCH_CREATE,
  BRANCH_MERGE,
  BRANCH_DELETE,
  FILE_HISTORY,
  FILE_READ_AT,
];
