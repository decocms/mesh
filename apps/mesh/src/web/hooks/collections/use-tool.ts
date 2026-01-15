/**
 * Tool Collection Hooks
 */

import { createToolCaller } from "../../../tools/client";
import type { ToolEntity } from "../../../tools/tool/schema";
import { useProjectContext } from "../../providers/project-context-provider";
import {
  type CollectionFilter,
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";

export type ToolFilter = CollectionFilter;
export type UseToolsOptions = UseCollectionListOptions<ToolEntity>;

export function useTools(options: UseToolsOptions = {}) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionList<ToolEntity>(org.slug, "TOOLS", toolCaller, options);
}

export function useTool(toolId: string | undefined) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionItem<ToolEntity>(org.slug, "TOOLS", toolId, toolCaller);
}

export function useToolActions() {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionActions<ToolEntity>(org.slug, "TOOLS", toolCaller);
}

export type { ToolEntity };
