// Re-export everything from our custom MCP OAuth implementation
// This file is kept for backwards compatibility

export {
  authenticateMcp,
  isConnectionAuthenticated,
  handleOAuthCallback,
  McpOAuthProvider,
  MemoryStorage,
  SessionStorageWrapper,
  getActiveOAuthSession,
} from "./mcp-oauth";

export type {
  AuthenticateMcpResult,
  McpOAuthProviderOptions,
  OAuthStorage,
} from "./mcp-oauth";
