/**
 * MCP App Model
 *
 * Manages the lifecycle and messaging for an MCP App instance.
 * Handles JSON-RPC communication between the host (Mesh) and
 * the guest UI (sandboxed iframe).
 */

import { injectCSP, type CSPInjectorOptions } from "./csp-injector.ts";
import {
  type DisplayMode,
  type HostCapabilities,
  type HostContext,
  type JsonRpcError,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type Theme,
  type UIInitializeParams,
  type UIInitializeResult,
  type UIMessageParams,
  type UIOpenLinkParams,
  type UIOpenLinkResult,
  type UIResourcesReadParams,
  type UIResourcesReadResult,
  type UISizeChangedParams,
  type UIToolResultParams,
  type UIToolsCallParams,
  type UIToolsCallResult,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
} from "./types.ts";

// ============================================================================
// Types
// ============================================================================

/** State of the MCP App */
export type MCPAppState =
  | "idle"
  | "loading"
  | "initializing"
  | "ready"
  | "error";

/** Event types emitted by the model */
export interface MCPAppModelEvents {
  stateChange: (state: MCPAppState) => void;
  sizeChange: (params: UISizeChangedParams) => void;
  message: (params: UIMessageParams) => void;
  error: (error: Error) => void;
}

/** Options for creating an MCP App model */
export interface MCPAppModelOptions {
  /** The HTML content of the app */
  html: string;
  /** The URI of the app resource */
  uri: string;
  /** Connection ID for proxying tool calls */
  connectionId: string;
  /** Tool name that triggered this app */
  toolName?: string;
  /** Tool input arguments */
  toolInput?: unknown;
  /** Tool result */
  toolResult?: unknown;
  /** Display mode */
  displayMode?: DisplayMode;
  /** CSP injection options */
  cspOptions?: CSPInjectorOptions;
  /** Function to call tools */
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<UIToolsCallResult>;
  /** Function to read resources */
  readResource: (uri: string) => Promise<UIResourcesReadResult>;
  /** Callback when size changes */
  onSizeChange?: (params: UISizeChangedParams) => void;
  /** Callback when app sends a message */
  onMessage?: (params: UIMessageParams) => void;
  /** Callback for open link requests */
  onOpenLink?: (params: UIOpenLinkParams) => Promise<boolean>;
}

// ============================================================================
// MCP App Model
// ============================================================================

/**
 * Model for managing an MCP App instance
 *
 * This class handles:
 * - HTML preparation (CSP injection)
 * - Iframe message handling
 * - JSON-RPC request/response routing
 * - Proxying tool calls to the MCP server
 */
export class MCPAppModel {
  private state: MCPAppState = "idle";
  private requestId = 0;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private iframe: HTMLIFrameElement | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private disposed = false;

  /** Prepared HTML with CSP injected */
  public readonly preparedHtml: string;

  /** Host context for initialization */
  private readonly hostContext: HostContext;

  constructor(private readonly options: MCPAppModelOptions) {
    // Prepare HTML with CSP injection
    this.preparedHtml = injectCSP(options.html, options.cspOptions);

    // Create host context
    this.hostContext = this.createHostContext();
  }

  /**
   * Get the current state
   */
  getState(): MCPAppState {
    return this.state;
  }

  /**
   * Attach to an iframe element
   *
   * This sets up message handling and initializes the app
   * once the iframe loads.
   */
  attach(iframe: HTMLIFrameElement): void {
    if (this.disposed) {
      throw new Error("MCPAppModel has been disposed");
    }

    this.iframe = iframe;
    this.setState("loading");

    // Set up message handler
    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener("message", this.messageHandler);

    // The iframe will load via srcdoc, and we'll initialize
    // when it sends a ready message or after a short delay
    iframe.addEventListener("load", () => {
      this.initializeApp();
    });

    // If iframe is already loaded (e.g., from cache or fast load), initialize now
    // Check if contentDocument exists and is ready
    try {
      if (
        iframe.contentDocument?.readyState === "complete" ||
        iframe.contentWindow
      ) {
        // Small delay to ensure the iframe's JS has executed
        setTimeout(() => this.initializeApp(), 50);
      }
    } catch {
      // Cross-origin access denied - will rely on load event
    }
  }

  /**
   * Detach from the iframe and clean up
   */
  detach(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.iframe = null;

    // Reject any pending requests
    for (const [_, pending] of this.pendingRequests) {
      pending.reject(new Error("MCPAppModel detached"));
    }
    this.pendingRequests.clear();
  }

  /**
   * Dispose of the model
   */
  dispose(): void {
    this.detach();
    this.disposed = true;
  }

  /**
   * Send tool result notification to the app
   */
  sendToolResult(toolName: string, result: unknown, isError = false): void {
    this.sendNotification("ui/notifications/tool-result", {
      toolName,
      result,
      isError,
    } satisfies UIToolResultParams);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setState(state: MCPAppState): void {
    this.state = state;
  }

  private createHostContext(): HostContext {
    // Detect theme from document
    const isDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const theme: Theme = isDark ? "dark" : "light";

    // Detect device capabilities
    const isHoverDevice =
      typeof window !== "undefined" &&
      window.matchMedia?.("(hover: hover)").matches;
    const isTouchDevice =
      typeof window !== "undefined" && "ontouchstart" in window;

    const capabilities: HostCapabilities = {
      displayModes: ["inline", "fullscreen"],
      toolCalls: true,
      resourceReads: true,
      messages: true,
      openLinks: true,
      externalIframes: false,
    };

    return {
      displayMode: this.options.displayMode ?? "inline",
      theme,
      device: {
        isHoverDevice,
        isTouchDevice,
      },
      capabilities,
      instanceId: crypto.randomUUID(),
      hostName: "Mesh",
      hostVersion: "1.0.0",
    };
  }

  private async initializeApp(): Promise<void> {
    if (this.state !== "loading" || !this.iframe) {
      return;
    }

    this.setState("initializing");

    try {
      const params: UIInitializeParams = {
        hostContext: this.hostContext,
        toolName: this.options.toolName,
        toolInput: this.options.toolInput,
        toolResult: this.options.toolResult,
      };

      // Send initialize request
      const result = await this.sendRequest<UIInitializeResult>(
        "ui/initialize",
        params,
      );

      // App initialized successfully
      this.setState("ready");

      // Handle guest capabilities if provided
      if (result?.guestCapabilities) {
        // Could update display mode based on preferences
      }
    } catch (error) {
      console.error("Failed to initialize MCP App:", error);
      this.setState("error");
    }
  }

  private handleMessage(event: MessageEvent): void {
    // Verify the message is from our iframe
    if (!this.iframe || event.source !== this.iframe.contentWindow) {
      return;
    }

    let message: JsonRpcMessage;
    try {
      message =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch {
      console.warn("MCP App sent non-JSON message:", event.data);
      return;
    }

    // Handle response to our request
    if (isJsonRpcResponse(message)) {
      this.handleResponse(message);
      return;
    }

    // Handle request from guest
    if (isJsonRpcRequest(message)) {
      this.handleRequest(message);
      return;
    }

    // Handle notification from guest
    if (isJsonRpcNotification(message)) {
      this.handleNotification(message);
      return;
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn("Received response for unknown request:", response.id);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    let result: unknown;
    let error: JsonRpcError | undefined;

    try {
      switch (request.method) {
        case "tools/call": {
          const params = request.params as UIToolsCallParams;
          result = await this.options.callTool(
            params.name,
            params.arguments ?? {},
          );
          break;
        }

        case "resources/read": {
          const params = request.params as UIResourcesReadParams;
          result = await this.options.readResource(params.uri);
          break;
        }

        case "ui/open-link": {
          const params = request.params as UIOpenLinkParams;
          if (this.options.onOpenLink) {
            const success = await this.options.onOpenLink(params);
            result = { success } satisfies UIOpenLinkResult;
          } else {
            // Default: open in new tab
            window.open(params.url, params.target ?? "_blank");
            result = { success: true } satisfies UIOpenLinkResult;
          }
          break;
        }

        default:
          error = {
            code: -32601,
            message: `Method not found: ${request.method}`,
          };
      }
    } catch (err) {
      error = {
        code: -32603,
        message: err instanceof Error ? err.message : "Internal error",
      };
    }

    // Send response
    this.sendResponse(request.id, result, error);
  }

  private handleNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case "ui/notifications/size-changed": {
        const params = notification.params as UISizeChangedParams;
        this.options.onSizeChange?.(params);
        break;
      }

      case "ui/message": {
        const params = notification.params as UIMessageParams;
        this.options.onMessage?.(params);
        break;
      }

      default:
        console.warn("Unknown notification from MCP App:", notification.method);
    }
  }

  private sendRequest<T>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.iframe?.contentWindow) {
        reject(new Error("Iframe not available"));
        return;
      }

      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      // Set a timeout for the request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);

      this.iframe.contentWindow.postMessage(JSON.stringify(request), "*");
    });
  }

  private sendResponse(
    id: string | number,
    result?: unknown,
    error?: JsonRpcError,
  ): void {
    if (!this.iframe?.contentWindow) {
      return;
    }

    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id,
      ...(error ? { error } : { result }),
    };

    this.iframe.contentWindow.postMessage(JSON.stringify(response), "*");
  }

  private sendNotification(method: string, params?: unknown): void {
    if (!this.iframe?.contentWindow) {
      return;
    }

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.iframe.contentWindow.postMessage(JSON.stringify(notification), "*");
  }
}
