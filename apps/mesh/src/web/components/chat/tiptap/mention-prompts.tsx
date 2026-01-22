import { KEYS } from "@/web/lib/query-keys";
import {
  getPrompt,
  listPrompts,
  useMCPClient,
  useProjectContext,
  type VirtualMCPPrompt,
} from "@decocms/mesh-sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
  client: Client,
  promptName: string,
  values?: PromptArgumentValues,
) {
  try {
    const result = await getPrompt(client, promptName, values);

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
  const client = useMCPClient({
    connectionId: virtualMcpId,
    orgSlug: org.slug,
    isVirtualMCP: true,
  });
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
    if (!client) return;
    await fetchAndInsertPrompt(editor, range, client, item.name);
  };

  const handleDialogSubmit = async (values: PromptArgumentValues) => {
    if (!activePrompt || !client) return;

    const { range, item: prompt } = activePrompt;

    await fetchAndInsertPrompt(editor, range, client, prompt.name, values);
    setActivePrompt(null);
  };

  const fetchItems = async (props: { query: string }) => {
    const { query } = props;

    if (!client) return [];

    // Try to get from cache first (even if stale)
    let virtualMcpPrompts =
      queryClient.getQueryData<VirtualMCPPrompt[]>(queryKey);

    // If not in cache or we want fresh data, fetch from network
    // fetchQuery will use cache if fresh, otherwise fetch
    if (!virtualMcpPrompts) {
      const result = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => listPrompts(client),
        staleTime: 60000, // 1 minute
      });
      virtualMcpPrompts = result.prompts;
    } else {
      // Prefetch in background to ensure fresh data
      queryClient
        .fetchQuery({
          queryKey,
          queryFn: () => listPrompts(client),
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
