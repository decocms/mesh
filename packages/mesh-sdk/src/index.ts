// Context
export {
  ProjectContextProvider,
  useProjectContext,
  Locator,
  ORG_ADMIN_PROJECT_SLUG,
  type ProjectContextProviderProps,
  type ProjectLocator,
  type LocatorStructured,
} from "./context";

// Hooks
export {
  // Collection hooks
  useCollectionItem,
  useCollectionList,
  useCollectionActions,
  type CollectionEntity,
  type CollectionFilter,
  type UseCollectionListOptions,
  // Connection hooks
  useConnections,
  useConnection,
  useConnectionActions,
  type ConnectionFilter,
  type UseConnectionsOptions,
  // MCP client hook
  useMCPClient,
  type UseMcpClientOptions,
  // MCP tools hooks
  useMCPToolsList,
  useMCPToolsListQuery,
  useMCPToolCall,
  useMCPToolCallQuery,
  useMCPToolCallMutation,
  type UseMcpToolsListOptions,
  type UseMcpToolsListQueryOptions,
  type UseMcpToolCallOptions,
  type UseMcpToolCallQueryOptions,
  type UseMcpToolCallMutationOptions,
  // MCP resources hooks and helpers
  listResources,
  readResource,
  useMCPResourcesList,
  useMCPResourcesListQuery,
  useMCPReadResource,
  type UseMcpResourcesListOptions,
  type UseMcpResourcesListQueryOptions,
  type UseMcpReadResourceOptions,
  // MCP prompts hooks and helpers
  listPrompts,
  getPrompt,
  useMCPPromptsList,
  useMCPPromptsListQuery,
  useMCPGetPrompt,
  type UseMcpPromptsListOptions,
  type UseMcpPromptsListQueryOptions,
  type UseMcpGetPromptOptions,
} from "./hooks";

// Types
export {
  ConnectionEntitySchema,
  ConnectionCreateDataSchema,
  ConnectionUpdateDataSchema,
  isStdioParameters,
  parseVirtualUrl,
  buildVirtualUrl,
  type ConnectionEntity,
  type ConnectionCreateData,
  type ConnectionUpdateData,
  type ConnectionParameters,
  type HttpConnectionParameters,
  type StdioConnectionParameters,
  type OAuthConfig,
  type ToolDefinition,
} from "./types";

// Streamable HTTP transport
export { StreamableHTTPClientTransport } from "./lib/streamable-http-client-transport";

// Query keys
export { KEYS } from "./lib/query-keys";
