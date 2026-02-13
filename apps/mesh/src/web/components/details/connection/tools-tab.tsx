import { ToolsList, type Tool } from "@/web/components/tools";

interface ToolsTabProps {
  tools: Tool[] | undefined;
  connectionId: string;
  org: string;
  isLoading?: boolean;
}

export function ToolsTab({
  tools,
  connectionId,
  org,
  isLoading,
}: ToolsTabProps) {
  return (
    <ToolsList
      tools={tools}
      connectionId={connectionId}
      org={org}
      isLoading={isLoading}
    />
  );
}
