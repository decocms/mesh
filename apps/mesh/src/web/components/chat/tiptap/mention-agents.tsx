import { KEYS } from "@/web/lib/query-keys";
import {
  isDecopilot,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import type { Editor } from "@tiptap/react";
import { BaseItem, insertMention, OnSelectProps, Suggestion } from "./mention";

interface AgentsMentionProps {
  editor: Editor;
  virtualMcpId: string | null;
}

interface AgentItem extends BaseItem {
  agentId: string;
}

export const AgentsMention = ({ editor, virtualMcpId }: AgentsMentionProps) => {
  const { org } = useProjectContext();
  const agents = useVirtualMCPs();
  const queryKey = KEYS.virtualMcpAgents(org.id);

  const handleItemSelect = async ({
    item,
    range,
  }: OnSelectProps<AgentItem>) => {
    insertMention(editor, range, {
      id: item.agentId,
      name: item.name,
      metadata: { agentId: item.agentId, title: item.name },
      char: "@",
    });
  };

  const fetchItems = async (props: { query: string }) => {
    const { query } = props;

    // Filter out Decopilot and the currently active agent
    let filtered = agents.filter(
      (agent) =>
        agent.status === "active" &&
        (!agent.id || !isDecopilot(agent.id)) &&
        agent.id !== virtualMcpId,
    );

    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(
        (agent) =>
          agent.title.toLowerCase().includes(lowerQuery) ||
          agent.description?.toLowerCase().includes(lowerQuery),
      );
    }

    return filtered.map((agent) => ({
      name: agent.title,
      title: agent.title,
      description: agent.description ?? undefined,
      icon: agent.icon ?? null,
      agentId: agent.id,
    })) as AgentItem[];
  };

  return (
    <Suggestion<AgentItem>
      editor={editor}
      char="@"
      pluginKey="agentsDropdownMenu"
      queryKey={queryKey}
      queryFn={fetchItems}
      onSelect={handleItemSelect}
    />
  );
};
