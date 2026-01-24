/**
 * MCP Apps Protocol Types
 *
 * Based on SEP-1865: MCP Apps - Interactive User Interfaces for MCP
 * https://github.com/modelcontextprotocol/ext-apps
 *
 * This file defines the types for bidirectional JSON-RPC communication
 * between the host (Mesh) and guest UI (sandboxed iframe).
 */

// ============================================================================
// Common Types
// ============================================================================

/** Display mode for the MCP App */
export type DisplayMode = "inline" | "pip" | "fullscreen";

/** Theme for the MCP App */
export type Theme = "light" | "dark" | "system";

/** Device capabilities */
export interface DeviceCapabilities {
  /** Whether the device supports hover interactions */
  isHoverDevice: boolean;
  /** Whether the device supports touch interactions */
  isTouchDevice: boolean;
}

/** Host capabilities advertised during initialization */
export interface HostCapabilities {
  /** Supported display modes */
  displayModes: DisplayMode[];
  /** Whether the host supports tool calls from the UI */
  toolCalls: boolean;
  /** Whether the host supports resource reads from the UI */
  resourceReads: boolean;
  /** Whether the host supports ui/message for conversation injection */
  messages: boolean;
  /** Whether the host supports ui/open-link */
  openLinks: boolean;
  /** Whether external iframes are allowed */
  externalIframes?: boolean;
}

/** Host context provided during initialization */
export interface HostContext {
  /** The current display mode */
  displayMode: DisplayMode;
  /** Current theme */
  theme: Theme;
  /** Device capabilities */
  device: DeviceCapabilities;
  /** Host capabilities */
  capabilities: HostCapabilities;
  /** Unique identifier for this app instance */
  instanceId: string;
  /** Name of the host application */
  hostName: string;
  /** Version of the host application */
  hostVersion: string;
}

/** MIME type for MCP App HTML content */
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

/** URI scheme for MCP App resources */
export const MCP_APP_URI_SCHEME = "ui://";

/** Metadata key for UI resource URI in tool _meta */
export const UI_RESOURCE_URI_KEY = "ui/resourceUri";

// ============================================================================
// Display Mode Dimensions
// ============================================================================

/**
 * MCP App Display Mode Configuration
 *
 * Apps are rendered in three modes, and UIs should be responsive to all:
 *
 * - **Collapsed Mode (default)**: Compact view within the chat
 *   Height: 150px - 400px
 *   Use case: Default tool result display in chat
 *
 * - **Expanded Mode**: Larger view when user clicks expand button in chat
 *   Height: 500px - 700px
 *   Use case: User wants more detail without leaving chat
 *
 * - **View Mode**: Full resource preview in connection screen
 *   Height: 400px - 800px (can be larger with available space)
 *   Use case: Previewing UI apps from the Resources tab
 *
 * All modes use the full available width of the container.
 *
 * CSS Breakpoints for responsive design:
 * - Collapsed: height < 450px
 * - Expanded:  450px <= height < 750px
 * - View:      height >= 750px
 *
 * Example CSS:
 * ```css
 * .compact-only { display: block; }
 * .expanded-content { display: none; }
 * .view-content { display: none; }
 *
 * @media (min-height: 450px) {
 *   .compact-only { display: none; }
 *   .expanded-content { display: block; }
 * }
 *
 * @media (min-height: 750px) {
 *   .view-content { display: block; }
 * }
 * ```
 */
export const MCP_APP_DISPLAY_MODES = {
  /** Collapsed mode - compact view in chat */
  collapsed: {
    minHeight: 150,
    maxHeight: 400,
  },
  /** Expanded mode - larger view when expanded in chat */
  expanded: {
    minHeight: 500,
    maxHeight: 700,
  },
  /** View mode - full resource preview in connection screen */
  view: {
    minHeight: 400,
    maxHeight: 800,
  },
} as const;

/** Type for display mode keys */
export type MCPAppDisplayModeKey = keyof typeof MCP_APP_DISPLAY_MODES;

/** CSS breakpoint thresholds for detecting modes */
export const MCP_APP_HEIGHT_BREAKPOINTS = {
  /** Below this: collapsed mode */
  expanded: 450,
  /** Above this: view mode */
  view: 750,
} as const;

// ============================================================================
// JSON-RPC Base Types
// ============================================================================

export interface JsonRpcRequest<
  TMethod extends string = string,
  TParams = unknown,
> {
  jsonrpc: "2.0";
  id: string | number;
  method: TMethod;
  params?: TParams;
}

export interface JsonRpcResponse<TResult = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  result?: TResult;
  error?: JsonRpcError;
}

export interface JsonRpcNotification<
  TMethod extends string = string,
  TParams = unknown,
> {
  jsonrpc: "2.0";
  method: TMethod;
  params?: TParams;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;

// ============================================================================
// Host → UI Messages
// ============================================================================

/** Parameters for ui/initialize request */
export interface UIInitializeParams {
  /** Host context information */
  hostContext: HostContext;
  /** Tool input that triggered this UI */
  toolInput?: unknown;
  /** Tool result to display */
  toolResult?: unknown;
  /** Tool name that triggered this UI */
  toolName?: string;
}

/** Result from ui/initialize */
export interface UIInitializeResult {
  /** Guest UI capabilities */
  guestCapabilities?: {
    /** Preferred display modes */
    preferredDisplayModes?: DisplayMode[];
  };
}

/** Parameters for ui/notifications/tool-input */
export interface UIToolInputParams {
  /** Tool name */
  toolName: string;
  /** Tool input arguments */
  input: unknown;
  /** Whether this is streaming (partial input) */
  isPartial?: boolean;
}

/** Parameters for ui/notifications/tool-result */
export interface UIToolResultParams {
  /** Tool name */
  toolName: string;
  /** Tool result */
  result: unknown;
  /** Whether the tool call resulted in an error */
  isError?: boolean;
}

/** Parameters for ui/notifications/tool-cancelled */
export interface UIToolCancelledParams {
  /** Tool name that was cancelled */
  toolName: string;
  /** Reason for cancellation */
  reason?: string;
}

/** Parameters for ui/notifications/tool-input-partial (streaming) */
export interface UIToolInputPartialParams {
  /** Tool name */
  toolName: string;
  /** Partial input data */
  partialInput: unknown;
}

// ============================================================================
// UI → Host Messages
// ============================================================================

/** Parameters for tools/call request from UI */
export interface UIToolsCallParams {
  /** Tool name to call */
  name: string;
  /** Tool arguments */
  arguments?: Record<string, unknown>;
}

/** Result from tools/call */
export interface UIToolsCallResult {
  /** Tool result content */
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  /** Whether the call resulted in an error */
  isError?: boolean;
}

/** Parameters for resources/read request from UI */
export interface UIResourcesReadParams {
  /** Resource URI to read */
  uri: string;
}

/** Result from resources/read */
export interface UIResourcesReadResult {
  /** Resource contents */
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

/** Parameters for ui/message notification */
export interface UIMessageParams {
  /** Message role */
  role: "user" | "assistant";
  /** Message content */
  content: string;
}

/** Parameters for ui/open-link request */
export interface UIOpenLinkParams {
  /** URL to open */
  url: string;
  /** Target for the link */
  target?: "_blank" | "_self";
}

/** Result from ui/open-link */
export interface UIOpenLinkResult {
  /** Whether the link was opened successfully */
  success: boolean;
}

/** Parameters for ui/notifications/size-changed */
export interface UISizeChangedParams {
  /** Preferred width in pixels */
  width?: number;
  /** Preferred height in pixels */
  height: number;
}

// ============================================================================
// Message Type Guards
// ============================================================================

export function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "jsonrpc" in msg &&
    msg.jsonrpc === "2.0" &&
    "id" in msg &&
    "method" in msg
  );
}

export function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "jsonrpc" in msg &&
    msg.jsonrpc === "2.0" &&
    "id" in msg &&
    !("method" in msg)
  );
}

export function isJsonRpcNotification(
  msg: unknown,
): msg is JsonRpcNotification {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "jsonrpc" in msg &&
    msg.jsonrpc === "2.0" &&
    "method" in msg &&
    !("id" in msg)
  );
}

// ============================================================================
// Helper Types
// ============================================================================

/** Tool metadata that may include UI resource URI */
export interface ToolMetaWithUI {
  [UI_RESOURCE_URI_KEY]?: string;
  connectionId?: string;
  connectionTitle?: string;
  [key: string]: unknown;
}

/** Check if a tool has an associated UI resource */
export function hasUIResource(meta: unknown): meta is ToolMetaWithUI {
  return (
    typeof meta === "object" &&
    meta !== null &&
    UI_RESOURCE_URI_KEY in meta &&
    typeof (meta as ToolMetaWithUI)[UI_RESOURCE_URI_KEY] === "string"
  );
}

/** Get the UI resource URI from tool metadata */
export function getUIResourceUri(meta: unknown): string | undefined {
  if (hasUIResource(meta)) {
    return meta[UI_RESOURCE_URI_KEY];
  }
  return undefined;
}

/** Check if a URI is a UI resource URI */
export function isUIResourceUri(uri: string): boolean {
  return uri.startsWith(MCP_APP_URI_SCHEME);
}
