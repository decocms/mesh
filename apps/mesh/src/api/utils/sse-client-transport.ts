/**
 * Custom SSE Client Transport for Node.js/Bun
 *
 * Implements the legacy MCP SSE protocol:
 * 1. GET request to establish SSE connection
 * 2. Server sends `event: endpoint` with the message endpoint URL
 * 3. Client sends JSON-RPC messages via POST to that endpoint
 */

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

interface SSEClientTransportOptions {
  requestInit?: {
    headers?: Record<string, string>;
  };
}

export class SSEClientTransport implements Transport {
  private sseUrl: URL;
  private messageEndpoint: string | null = null;
  private headers: Record<string, string>;
  private abortController: AbortController | null = null;

  sessionId?: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(sseUrl: URL, options?: SSEClientTransportOptions) {
    this.sseUrl = sseUrl;
    this.headers = options?.requestInit?.headers ?? {};
  }

  async start(): Promise<void> {
    this.abortController = new AbortController();

    const response = await fetch(this.sseUrl.toString(), {
      method: "GET",
      headers: {
        ...this.headers,
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("SSE response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const endpointPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for SSE endpoint event"));
      }, 10000);

      const readStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              clearTimeout(timeout);
              reject(new Error("SSE stream closed before receiving endpoint"));
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            let currentEvent = "";
            let currentData = "";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                currentData = line.slice(5).trim();
              } else if (line === "" && currentEvent && currentData) {
                if (currentEvent === "endpoint") {
                  clearTimeout(timeout);
                  resolve(currentData);
                  return;
                }
                currentEvent = "";
                currentData = "";
              }
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      };

      readStream();
    });

    this.messageEndpoint = await endpointPromise;

    const endpointUrl = new URL(this.messageEndpoint, this.sseUrl.origin);
    this.sessionId = endpointUrl.searchParams.get("sessionId") ?? undefined;

    this.readSSEStream(reader, decoder, buffer);
  }

  private async readSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    initialBuffer: string
  ): Promise<void> {
    let buffer = initialBuffer;
    let currentEvent = "";
    let currentData = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.onclose?.();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "" && currentData) {
            if (currentEvent === "message" || !currentEvent) {
              try {
                const message = JSON.parse(currentData) as JSONRPCMessage;
                this.onmessage?.(message);
              } catch {
                // Ignore parse errors
              }
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        this.onerror?.(error as Error);
      }
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.messageEndpoint) {
      throw new Error("SSE transport not started");
    }

    const endpoint = new URL(this.messageEndpoint, this.sseUrl.origin).toString();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SSE send failed: ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get("Content-Type");
    if (contentType?.includes("application/json")) {
      const responseData = await response.json() as JSONRPCMessage;
      this.onmessage?.(responseData);
    }
  }

  async close(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    this.messageEndpoint = null;
    this.sessionId = undefined;
  }
}
