import {
  fetchVirtualMCPPrompt,
  fetchVirtualMCPPrompts,
  type VirtualMCPPrompt,
} from "@/web/hooks/use-virtual-mcp-prompts";
import { KEYS } from "@/web/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import type { Editor, Range } from "@tiptap/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  PromptArgsDialog,
  type PromptArgumentValues,
} from "../dialog-prompt-arguments.tsx";
import { insertMention, OnSelectProps, Suggestion } from "./mention";

interface PromptSelectContext {
  range: Range;
  item: VirtualMCPPrompt;
}

interface PromptsMentionProps {
  editor: Editor;
  virtualMcpId: string | null;
}

/**
 * Fetches a prompt and inserts it as a mention node in the editor.
 */
async function fetchAndInsertPrompt(
  editor: Editor,
  range: Range,
  virtualMcpId: string,
  promptName: string,
  values?: PromptArgumentValues,
) {
  try {
    const result = await fetchVirtualMCPPrompt(virtualMcpId, promptName, values);

    if (result.messages && result.messages.length > 0) {
      insertMention(editor, range, {
        id: promptName,
        name: promptName,
        metadata: result.messages,
        char: "/",
      });
    }
  } catch (error) {
    console.error("[prompt] Failed to fetch prompt:", error);
    toast.error("Failed to load prompt. Please try again.");
  }
}

export const PromptsMention = ({
  editor,
  virtualMcpId,
}: PromptsMentionProps) => {
  const queryClient = useQueryClient();
  const queryKey = virtualMcpId
    ? KEYS.virtualMcpPrompts(virtualMcpId)
    : (["virtual-mcp", "prompts", "empty"] as const);
  const [activePrompt, setActivePrompt] = useState<PromptSelectContext | null>(
    null,
  );

  const handleItemSelect = async ({
    item,
    range,
  }: OnSelectProps<VirtualMCPPrompt>) => {
    if (!virtualMcpId) return;

    // If prompt has arguments, open dialog
    if (item.arguments && item.arguments.length > 0) {
      setActivePrompt({ range, item: item });
      return;
    }

    // No arguments - fetch and insert directly
    await fetchAndInsertPrompt(editor, range, virtualMcpId, item.name);
  };

  const handleDialogSubmit = async (values: PromptArgumentValues) => {
    if (!activePrompt || !virtualMcpId) return;

    const { range, item: prompt } = activePrompt;

    await fetchAndInsertPrompt(editor, range, virtualMcpId, prompt.name, values);
    setActivePrompt(null);
  };

  const fetchItems = async (props: { query: string }) => {
    if (!virtualMcpId) return [];

    const { query } = props;

    // Try to get from cache first (even if stale)
    let virtualMcpPrompts =
      queryClient.getQueryData<VirtualMCPPrompt[]>(queryKey);

    // If not in cache or we want fresh data, fetch from network
    // fetchQuery will use cache if fresh, otherwise fetch
    if (!virtualMcpPrompts) {
      virtualMcpPrompts = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => fetchVirtualMCPPrompts(virtualMcpId),
        staleTime: 60000, // 1 minute
      });
    } else {
      // Prefetch in background to ensure fresh data
      queryClient
        .fetchQuery({
          queryKey,
          queryFn: () => fetchVirtualMCPPrompts(virtualMcpId),
          staleTime: 60000,
        })
        .catch(() => {
          // Ignore errors in background fetch
        });
    }

    // Ensure we have prompts (fallback to empty array)
    if (!virtualMcpPrompts) {
      return [];
    }

    // Filter prompts based on query
    let filteredPrompts = virtualMcpPrompts;
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filteredPrompts = virtualMcpPrompts.filter(
        (p) =>
          p.name.toLowerCase().includes(lowerQuery) ||
          p.title?.toLowerCase().includes(lowerQuery) ||
          p.description?.toLowerCase().includes(lowerQuery),
      );
    }

    return filteredPrompts;
  };

  return (
    <>
      <Suggestion<VirtualMCPPrompt>
        editor={editor}
        char="/"
        pluginKey="promptsDropdownMenu"
        queryKey={queryKey}
        queryFn={fetchItems}
        onSelect={handleItemSelect}
      />
      <PromptArgsDialog
        prompt={activePrompt?.item ?? null}
        setPrompt={() => setActivePrompt(null)}
        onSubmit={handleDialogSubmit}
      />
    </>
  );
};
