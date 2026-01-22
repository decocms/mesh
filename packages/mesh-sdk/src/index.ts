// Context
export {
  ProjectContextProvider,
  useProjectContext,
  Locator,
  type ProjectContextProviderProps,
  type ProjectLocator,
  type LocatorStructured,
} from "./context";

// Hooks
export {
  // Tool call hooks
  useToolCall,
  useToolCallMutation,
  useToolCallQuery,
  type UseToolCallOptions,
  type UseToolCallMutationOptions,
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
  // MCP hook
  useMcp,
  type McpTool,
  type McpState,
  type UseMcpOptions,
  type UseMcpResult,
} from "./hooks";

// Types
export {
  ConnectionEntitySchema,
  ConnectionCreateDataSchema,
  ConnectionUpdateDataSchema,
  isStdioParameters,
  type ConnectionEntity,
  type ConnectionCreateData,
  type ConnectionUpdateData,
  type ConnectionParameters,
  type HttpConnectionParameters,
  type StdioConnectionParameters,
  type OAuthConfig,
  type ToolDefinition,
} from "./types";

// Tool caller
export {
  createToolCaller,
  UNKNOWN_CONNECTION_ID,
  type ToolCaller,
} from "./lib/tool-caller";

// Query keys
export { KEYS } from "./lib/query-keys";
