import {
  fetchVirtualMCPPrompt,
  fetchVirtualMCPPrompts,
  type VirtualMCPPrompt,
} from "@/web/hooks/use-virtual-mcp-client";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
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
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 * @param orgSlug - The organization slug
 */
async function fetchAndInsertPrompt(
  editor: Editor,
  range: Range,
  virtualMcpId: string | null,
  orgSlug: string,
  promptName: string,
  values?: PromptArgumentValues,
) {
  try {
    const result = await fetchVirtualMCPPrompt(
      virtualMcpId,
      orgSlug,
      promptName,
      values,
    );

    insertMention(editor, range, {
      id: promptName,
      name: promptName,
      metadata: result.messages,
      char: "/",
    });
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
  const { org } = useProjectContext();
  // Use the query key helper which handles null (default virtual MCP)
  const queryKey = KEYS.virtualMcpPrompts(virtualMcpId, org.slug);
  const [activePrompt, setActivePrompt] = useState<PromptSelectContext | null>(
    null,
  );

  const handleItemSelect = async ({
    item,
    range,
  }: OnSelectProps<VirtualMCPPrompt>) => {
    // If prompt has arguments, open dialog
    if (item.arguments && item.arguments.length > 0) {
      setActivePrompt({ range, item: item });
      return;
    }

    // No arguments - fetch and insert directly
    // virtualMcpId can be null (default virtual MCP)
    await fetchAndInsertPrompt(
      editor,
      range,
      virtualMcpId,
      org.slug,
      item.name,
    );
  };

  const handleDialogSubmit = async (values: PromptArgumentValues) => {
    if (!activePrompt) return;

    const { range, item: prompt } = activePrompt;

    // virtualMcpId can be null (default virtual MCP)
    await fetchAndInsertPrompt(
      editor,
      range,
      virtualMcpId,
      org.slug,
      prompt.name,
      values,
    );
    setActivePrompt(null);
  };

  const fetchItems = async (props: { query: string }) => {
    const { query } = props;

    // Try to get from cache first (even if stale)
    let virtualMcpPrompts =
      queryClient.getQueryData<VirtualMCPPrompt[]>(queryKey);

    // If not in cache or we want fresh data, fetch from network
    // fetchQuery will use cache if fresh, otherwise fetch
    if (!virtualMcpPrompts) {
      virtualMcpPrompts = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => fetchVirtualMCPPrompts(virtualMcpId, org.slug),
        staleTime: 60000, // 1 minute
      });
    } else {
      // Prefetch in background to ensure fresh data
      queryClient
        .fetchQuery({
          queryKey,
          queryFn: () => fetchVirtualMCPPrompts(virtualMcpId, org.slug),
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
