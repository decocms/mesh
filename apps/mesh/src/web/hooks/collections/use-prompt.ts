/**
 * Prompt Collection Hooks
 */

import { createToolCaller } from "../../../tools/client";
import type { PromptEntity } from "../../../tools/prompt/schema";
import { useProjectContext } from "../../providers/project-context-provider";
import {
  type CollectionFilter,
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";

export type PromptFilter = CollectionFilter;
export type UsePromptsOptions = UseCollectionListOptions<PromptEntity>;

export function usePrompts(options: UsePromptsOptions = {}) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionList<PromptEntity>(
    org.slug,
    "PROMPTS",
    toolCaller,
    options,
  );
}

export function usePrompt(promptId: string | undefined) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionItem<PromptEntity>(
    org.slug,
    "PROMPTS",
    promptId,
    toolCaller,
  );
}

export function usePromptActions() {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  return useCollectionActions<PromptEntity>(org.slug, "PROMPTS", toolCaller);
}

export type { PromptEntity };
