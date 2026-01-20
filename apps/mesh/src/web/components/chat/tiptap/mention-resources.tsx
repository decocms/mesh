import type { Editor } from "@tiptap/react";
import { BaseItem, OnSelectProps, Suggestion } from "./mention";

interface ResourcesMentionProps {
  editor: Editor;
}

export const ResourcesMention = ({ editor }: ResourcesMentionProps) => {
  // Empty list for now - will be replaced with actual resource fetching later
  const getResourceItems = async (_props: {
    query: string;
  }): Promise<BaseItem[]> => {
    return [];
  };

  const handleSelect = (_props: OnSelectProps<BaseItem>) => {
    // No-op for now - will be implemented when resources are added
  };

  return (
    <Suggestion<BaseItem>
      editor={editor}
      char="@"
      pluginKey="resourcesDropdownMenu"
      queryKey={["resources-suggestion"]}
      queryFn={getResourceItems}
      onSelect={handleSelect}
    />
  );
};
