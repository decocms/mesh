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
}

export function ToolsTab({ tools, connectionId, org }: ToolsTabProps) {
  return <ToolsList tools={tools} connectionId={connectionId} org={org} />;
}
