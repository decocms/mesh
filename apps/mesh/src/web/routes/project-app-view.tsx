import {
  getGatewayClientId,
  stripToolNamespace,
} from "@decocms/mcp-utils/aggregate";
import { stripMcpServerPrefix } from "@/web/lib/tool-namespace";
import {
  useProjectContext,
  useMCPClient,
  useMCPToolsList,
  useMCPToolCall,
} from "@decocms/mesh-sdk";
import type { McpUiMessageRequest } from "@modelcontextprotocol/ext-apps";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { contentBlocksToTiptapDoc } from "@/mcp-apps/content-blocks.ts";
import { MCPAppRenderer } from "@/mcp-apps/mcp-app-renderer.tsx";
import { getUIResourceUri, MCP_APP_DISPLAY_MODES } from "@/mcp-apps/types.ts";
import { useChatStream, useChatPrefs } from "@/web/components/chat/context.tsx";
import { usePanelActions } from "@/web/layouts/shell-layout";

const EMPTY_TOOL_INPUT: Record<string, unknown> = {};

function AppRenderer({
  client,
  resourceURI,
  tool,
  connectionId,
  orgId,
}: {
  client: ReturnType<typeof useMCPClient>;
  resourceURI: string;
  tool: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  };
  connectionId: string;
  orgId?: string;
}) {
  const { sendMessage } = useChatStream();
  const { setAppContext, clearAppContext } = useChatPrefs();
  const { setChatOpen } = usePanelActions();
  const sourceId = `${connectionId}:${tool.name}`;
  const { data: toolResult } = useMCPToolCall({
    client,
    toolName: tool.name,
    toolArguments: EMPTY_TOOL_INPUT,
  });

  const clientId = getGatewayClientId(tool._meta);
  const strippedName = stripToolNamespace(tool.name, clientId);
  const strippedTool: Tool = {
    ...tool,
    name: strippedName,
    inputSchema: (tool.inputSchema as Tool["inputSchema"]) ?? {
      type: "object" as const,
    },
  };

  const handleAppMessage = (params: McpUiMessageRequest["params"]) => {
    const doc = contentBlocksToTiptapDoc(params.content);
    if (doc.content.length > 0) {
      setChatOpen(true);
      sendMessage({ tiptapDoc: doc });
    }
  };

  return (
    <MCPAppRenderer
      resourceURI={resourceURI}
      orgId={orgId}
      toolInfo={{ tool: strippedTool }}
      toolInput={EMPTY_TOOL_INPUT}
      toolResult={toolResult}
      displayMode="fullscreen"
      minHeight={MCP_APP_DISPLAY_MODES.fullscreen.minHeight}
      maxHeight={MCP_APP_DISPLAY_MODES.fullscreen.maxHeight}
      client={client}
      onMessage={handleAppMessage}
      onUpdateModelContext={(params) => setAppContext(sourceId, params)}
      onTeardown={() => clearAppContext(sourceId)}
      className="h-full"
    />
  );
}

export function AppViewContent({
  connectionId,
  toolName,
}: {
  connectionId: string;
  toolName: string;
}) {
  const { org } = useProjectContext();
  const client = useMCPClient({ connectionId, orgId: org.id });
  const { data: toolsResult } = useMCPToolsList({ client });

  const decodedToolName = stripMcpServerPrefix(decodeURIComponent(toolName));

  const tool = toolsResult.tools.find((t) => t.name === decodedToolName);

  const resourceURI = tool?._meta ? getUIResourceUri(tool._meta) : undefined;

  if (!tool || !resourceURI) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <p className="text-sm text-muted-foreground">
          Tool &quot;{decodedToolName}&quot; not found or has no UI
        </p>
      </div>
    );
  }

  return (
    <AppRenderer
      client={client}
      resourceURI={resourceURI}
      tool={tool}
      connectionId={connectionId}
      orgId={org.id}
    />
  );
}
