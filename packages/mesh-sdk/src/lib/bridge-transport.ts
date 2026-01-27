import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * Bridge MCP Transport
 *
 * High-performance bridge transport for MCP communication within the same process.
 * Uses direct callbacks with microtask scheduling to avoid serialization overhead
 * and minimize event loop impact.
 *
 * ## Design
 *
 * - **Zero serialization**: Messages are passed as JavaScript objects by reference
 * - **Microtask scheduling**: Uses `queueMicrotask` to avoid deep recursion while
 *   maintaining message ordering
 * - **Direct callbacks**: No Web API overhead (EventTarget, MessageChannel, etc.)
 *
 * ## Usage
 *
 * ```ts
 * import { createBridgeTransportPair } from "@decocms/mesh-sdk";
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 * import { Server } from "@modelcontextprotocol/sdk/server/index.js";
 *
 * const { client: clientTransport, server: serverTransport } =
 *   createBridgeTransportPair();
 *
 * const client = new Client({ name: "test-client", version: "1.0.0" });
 * const server = new Server({ name: "test-server", version: "1.0.0" });
 *
 * await server.connect(serverTransport);
 * await client.connect(clientTransport);
 *
 * // Now client and server can communicate via bridge
 * ```
 */

type TransportSide = "client" | "server";

/**
 * Maximum number of messages that can be queued before throwing an error.
 * This prevents unbounded memory growth if one side sends faster than the other processes.
 */
const MAX_QUEUE_SIZE = 10_000;

/**
 * Internal channel that manages bidirectional message queues between client and server.
 */
class BridgeChannel {
  private clientQueue: JSONRPCMessage[] = [];
  private serverQueue: JSONRPCMessage[] = [];
  private clientClosed = false;
  private serverClosed = false;
  private clientFlushScheduled = false;
  private serverFlushScheduled = false;

  // Use type-only forward reference to avoid circular dependency
  private clientTransport?: { deliverMessage(message: JSONRPCMessage): void };
  private serverTransport?: { deliverMessage(message: JSONRPCMessage): void };

  /**
   * Register transports with the channel and link them to each other.
   * This sets up both message delivery and close notifications.
   */
  registerTransports(
    client: BridgeClientTransport,
    server: BridgeServerTransport,
  ): void {
    this.clientTransport = client;
    this.serverTransport = server;
    // Link transports to each other for close notifications
    client.setOppositeTransport(server);
    server.setOppositeTransport(client);
  }

  /**
   * Get the queue for a specific side (opposite of sender)
   */
  private getQueue(side: TransportSide): JSONRPCMessage[] {
    return side === "client" ? this.clientQueue : this.serverQueue;
  }

  /**
   * Check if the target side is closed
   */
  isClosed(side: TransportSide): boolean {
    return side === "client" ? this.clientClosed : this.serverClosed;
  }

  /**
   * Mark a side as closed
   */
  close(side: TransportSide): void {
    if (side === "client") {
      this.clientClosed = true;
      this.clientQueue = [];
    } else {
      this.serverClosed = true;
      this.serverQueue = [];
    }
  }

  /**
   * Enqueue a message to the target side's queue
   * @throws Error if queue size exceeds MAX_QUEUE_SIZE
   */
  enqueue(side: TransportSide, message: JSONRPCMessage): void {
    if (this.isClosed(side)) {
      // Silent no-op when target is closed (matches stdio transport behavior)
      return;
    }

    const queue = this.getQueue(side);

    // Prevent unbounded memory growth
    if (queue.length >= MAX_QUEUE_SIZE) {
      throw new Error(
        `BridgeTransport: ${side} queue overflow (max ${MAX_QUEUE_SIZE} messages). ` +
          "The receiver may not be processing messages fast enough.",
      );
    }

    queue.push(message);

    // Schedule flush if not already scheduled
    if (side === "client" && !this.clientFlushScheduled) {
      this.scheduleFlush("client");
    } else if (side === "server" && !this.serverFlushScheduled) {
      this.scheduleFlush("server");
    }
  }

  /**
   * Schedule a flush operation for the given side using microtask scheduling.
   * This frees the event loop and prevents deep recursion.
   */
  private scheduleFlush(side: TransportSide): void {
    if (side === "client") {
      this.clientFlushScheduled = true;
    } else {
      this.serverFlushScheduled = true;
    }

    queueMicrotask(() => {
      this.flush(side);
    });
  }

  /**
   * Flush all messages from the queue for a specific side
   * and deliver them to the appropriate transport
   */
  flush(side: TransportSide): void {
    const queue = this.getQueue(side);

    // Reset scheduled flag
    if (side === "client") {
      this.clientFlushScheduled = false;
    } else {
      this.serverFlushScheduled = false;
    }

    // If closed, clear queue and return
    if (this.isClosed(side)) {
      queue.length = 0;
      return;
    }

    // Get the transport for this side
    const transport =
      side === "client" ? this.clientTransport : this.serverTransport;

    if (!transport) {
      // Transport not registered yet, messages will be processed when it starts
      return;
    }

    // Drain queue in FIFO order and deliver to transport
    // Continue draining even if transport isn't ready yet - deliverMessage will check
    while (queue.length > 0) {
      const message = queue.shift()!;
      transport.deliverMessage(message);
    }
  }

  /**
   * Close both sides of the channel
   */
  closeBoth(): void {
    this.close("client");
    this.close("server");
  }
}

/**
 * Base transport implementation shared by client and server transports
 */
abstract class BaseBridgeTransport implements Transport {
  protected channel: BridgeChannel;
  protected side: TransportSide;
  protected started = false;
  protected closed = false;
  private _onmessage?: (message: JSONRPCMessage) => void;
  private _onerror?: (error: Error) => void;
  private _onclose?: () => void;

  constructor(channel: BridgeChannel, side: TransportSide) {
    this.channel = channel;
    this.side = side;
  }

  get onmessage(): ((message: JSONRPCMessage) => void) | undefined {
    return this._onmessage;
  }

  set onmessage(fn: ((message: JSONRPCMessage) => void) | undefined) {
    this._onmessage = fn;
    // If transport is started and onmessage is set, flush any queued messages
    if (fn && this.started && !this.closed) {
      this.channel.flush(this.side);
    }
  }

  get onerror(): ((error: Error) => void) | undefined {
    return this._onerror;
  }

  set onerror(fn: ((error: Error) => void) | undefined) {
    this._onerror = fn;
  }

  get onclose(): (() => void) | undefined {
    return this._onclose;
  }

  set onclose(fn: (() => void) | undefined) {
    this._onclose = fn;
  }

  /**
   * Start the transport. For bridge transports, this is a no-op
   * but required by the Transport interface.
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new Error(
        `${this.side === "client" ? "BridgeClientTransport" : "BridgeServerTransport"} already started! If using Client/Server class, note that connect() calls start() automatically.`,
      );
    }
    this.started = true;
    // Process any messages that were queued before start
    // If onmessage is already set, flush immediately; otherwise it will flush when onmessage is set
    if (this._onmessage && !this.closed) {
      this.channel.flush(this.side);
    }
  }

  /**
   * Send a message to the opposite side
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      // Silent no-op when transport is closed (matches stdio transport behavior)
      return Promise.resolve();
    }

    const targetSide: TransportSide =
      this.side === "client" ? "server" : "client";
    this.channel.enqueue(targetSide, message);

    // Resolve immediately - message delivery is async via microtask
    return Promise.resolve();
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    if (!this.started || this.closed) {
      return;
    }

    this.closed = true;
    this.channel.close(this.side);

    // Notify opposite side that we closed
    const oppositeTransport = this.getOppositeTransport();
    if (oppositeTransport && !oppositeTransport.closed) {
      oppositeTransport._onclose?.();
    }

    this._onclose?.();
  }

  /**
   * Get reference to the opposite transport (set by factory)
   */
  protected abstract getOppositeTransport(): BaseBridgeTransport | undefined;

  /**
   * Set reference to opposite transport (called by factory)
   */
  abstract setOppositeTransport(transport: BaseBridgeTransport): void;

  /**
   * Internal method to deliver a message to this transport
   * Called by the channel during flush operations
   */
  deliverMessage(message: JSONRPCMessage): void {
    if (!this.started || this.channel.isClosed(this.side)) {
      return;
    }

    try {
      this._onmessage?.(message);
    } catch (error) {
      this._onerror?.(error as Error);
    }
  }
}

/**
 * Client-side bridge transport
 */
export class BridgeClientTransport extends BaseBridgeTransport {
  private oppositeTransport?: BridgeServerTransport;

  constructor(channel: BridgeChannel) {
    super(channel, "client");
  }

  protected getOppositeTransport(): BaseBridgeTransport | undefined {
    return this.oppositeTransport;
  }

  setOppositeTransport(transport: BaseBridgeTransport): void {
    if (!(transport instanceof BridgeServerTransport)) {
      throw new Error("Opposite transport must be BridgeServerTransport");
    }
    this.oppositeTransport = transport;
  }

  override async start(): Promise<void> {
    await super.start();
    // Callbacks will be set by MCP SDK after start()
    // We use property setters to sync them with internal handlers
  }

  override async send(message: JSONRPCMessage): Promise<void> {
    await super.send(message);
  }
}

/**
 * Server-side bridge transport
 */
export class BridgeServerTransport extends BaseBridgeTransport {
  private oppositeTransport?: BridgeClientTransport;

  constructor(channel: BridgeChannel) {
    super(channel, "server");
  }

  protected getOppositeTransport(): BaseBridgeTransport | undefined {
    return this.oppositeTransport;
  }

  setOppositeTransport(transport: BaseBridgeTransport): void {
    if (!(transport instanceof BridgeClientTransport)) {
      throw new Error("Opposite transport must be BridgeClientTransport");
    }
    this.oppositeTransport = transport;
  }

  override async start(): Promise<void> {
    await super.start();
    // Callbacks will be set by MCP SDK after start()
    // We use property setters to sync them with internal handlers
  }

  override async send(message: JSONRPCMessage): Promise<void> {
    await super.send(message);
  }
}

/**
 * Result of creating a bridge transport pair
 */
export interface BridgeTransportPair {
  /**
   * Client-side transport (for MCP Client)
   */
  client: BridgeClientTransport;
  /**
   * Server-side transport (for MCP Server)
   */
  server: BridgeServerTransport;
  /**
   * Internal channel (for advanced use cases)
   */
  channel: BridgeChannel;
}

/**
 * Create a pair of bridge transports for client-server communication.
 *
 * Uses microtask scheduling for message delivery, which frees the event loop
 * and prevents deep recursion while maintaining message ordering.
 *
 * @returns A pair of transports connected via a bridge channel
 *
 * @example
 * ```ts
 * const { client, server } = createBridgeTransportPair();
 *
 * const mcpClient = new Client({ name: "test", version: "1.0.0" });
 * const mcpServer = new Server({ name: "test", version: "1.0.0" });
 *
 * await mcpServer.connect(server);
 * await mcpClient.connect(client);
 *
 * // Now client and server can communicate via bridge
 * ```
 */
export function createBridgeTransportPair(): BridgeTransportPair {
  const channel = new BridgeChannel();
  const client = new BridgeClientTransport(channel);
  const server = new BridgeServerTransport(channel);

  // Register transports with channel (also links them for close notifications)
  channel.registerTransports(client, server);

  return { client, server, channel };
}
