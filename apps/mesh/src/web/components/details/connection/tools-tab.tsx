import { ToolsList } from "@/web/components/tools";

interface ToolsTabProps {
  tools:
    | Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>
    | undefined;
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
