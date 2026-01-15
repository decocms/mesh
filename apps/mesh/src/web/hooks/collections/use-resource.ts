/**
 * Resource Collection Hooks
 */

import { createToolCaller } from "../../../tools/client";
import type { ResourceEntity } from "../../../tools/resource/schema";
import { useProjectContext } from "../../providers/project-context-provider";
import {
  type CollectionFilter,
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";

export type ResourceFilter = CollectionFilter;
export type UseResourcesOptions = UseCollectionListOptions<ResourceEntity>;

export function useResources(options: UseResourcesOptions = {}) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionList<ResourceEntity>(
    org.slug,
    "RESOURCES",
    toolCaller,
    options,
  );
}

export function useResource(resourceId: string | undefined) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionItem<ResourceEntity>(
    org.slug,
    "RESOURCES",
    resourceId,
    toolCaller,
  );
}

export function useResourceActions() {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionActions<ResourceEntity>(
    org.slug,
    "RESOURCES",
    toolCaller,
  );
}

export type { ResourceEntity };
