import type {
  CallToolRequest,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { MeshContext } from "../../core/mesh-context";

type CallToolMiddleware = (
  request: CallToolRequest,
  next: () => Promise<CallToolResult>,
) => Promise<CallToolResult>;

type CallStreamableToolMiddleware = (
  request: CallToolRequest,
  next: () => Promise<Response>,
) => Promise<Response>;

const MAX_STREAMABLE_LOG_BYTES = 256 * 1024; // 256KB (avoid unbounded memory on long streams)

function extractCallToolErrorMessage(
  result: CallToolResult,
): string | undefined {
  if (!result.isError) return undefined;
  const content = (result as unknown as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;

  for (const item of content) {
    if (
      item &&
      typeof item === "object" &&
      "type" in item &&
      (item as { type?: unknown }).type === "text" &&
      "text" in item &&
      typeof (item as { text?: unknown }).text === "string"
    ) {
      return (item as { text: string }).text;
    }
  }

  return undefined;
}

/**
 * Normalize tool output for monitoring logs.
 *
 * If the tool result includes a `structuredContent` payload, store ONLY that to
 * avoid duplicating both structured + text output in the database.
 */
function formatMonitoringOutput(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const structured = record.structuredContent;
    if (
      structured &&
      typeof structured === "object" &&
      !Array.isArray(structured)
    ) {
      return structured as Record<string, unknown>;
    }
    return record;
  }
  return { value };
}

async function readBodyTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const body = response.body;
  if (!body) return { text: "", truncated: false };

  const reader = body.getReader();
  const decoder = new TextDecoder();

  let truncated = false;
  let bytesRead = 0;
  const parts: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      if (value) {
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          truncated = true;
          const allowed = maxBytes - (bytesRead - value.byteLength);
          if (allowed > 0) {
            parts.push(
              decoder.decode(value.slice(0, allowed), { stream: true }),
            );
          }
          break;
        }
        parts.push(decoder.decode(value, { stream: true }));
      }
    }
  } finally {
    reader.releaseLock();
  }

  parts.push(decoder.decode());

  return { text: parts.join(""), truncated };
}

async function logProxyMonitoringEvent(args: {
  ctx: MeshContext;
  enabled: boolean;
  organizationId?: string;
  connectionId: string;
  connectionTitle: string;
  request: CallToolRequest;
  output: Record<string, unknown>;
  isError: boolean;
  errorMessage?: string;
  durationMs: number;
}): Promise<void> {
  const { ctx, enabled } = args;
  const organizationId = args.organizationId ?? ctx.organization?.id;
  if (!enabled || !organizationId) return;

  await ctx.storage.monitoring.log({
    organizationId,
    connectionId: args.connectionId,
    connectionTitle: args.connectionTitle,
    toolName: args.request.params.name,
    input: (args.request.params.arguments ?? {}) as Record<string, unknown>,
    output: args.output,
    isError: args.isError,
    errorMessage: args.errorMessage,
    durationMs: args.durationMs,
    timestamp: new Date(),
    userId: ctx.auth.user?.id || ctx.auth.apiKey?.userId || null,
    requestId: ctx.metadata.requestId,
  });
}

export interface ProxyMonitoringMiddlewareParams {
  ctx: MeshContext;
  enabled: boolean;
  connectionId: string;
  connectionTitle: string;
}

export function createProxyMonitoringMiddleware(
  params: ProxyMonitoringMiddlewareParams,
): CallToolMiddleware {
  const { ctx, enabled, connectionId, connectionTitle } = params;

  return async (request, next) => {
    const startTime = Date.now();

    try {
      const result = await next();
      const duration = Date.now() - startTime;

      await logProxyMonitoringEvent({
        ctx,
        enabled,
        connectionId,
        connectionTitle,
        request,
        output: formatMonitoringOutput(result),
        isError: Boolean(result.isError),
        errorMessage: extractCallToolErrorMessage(result),
        durationMs: duration,
      });

      return result;
    } catch (error) {
      const err = error as Error;
      const duration = Date.now() - startTime;

      await logProxyMonitoringEvent({
        ctx,
        enabled,
        connectionId,
        connectionTitle,
        request,
        output: {},
        isError: true,
        errorMessage: err.message,
        durationMs: duration,
      });

      throw error;
    }
  };
}

export function createProxyStreamableMonitoringMiddleware(
  params: ProxyMonitoringMiddlewareParams,
): CallStreamableToolMiddleware {
  const { ctx, enabled, connectionId, connectionTitle } = params;

  return async (request, next) => {
    const startTime = Date.now();

    try {
      const response = await next();

      const organizationId = ctx.organization?.id;
      if (enabled && organizationId) {
        // Read a clone to capture output without blocking the stream to the caller.
        const cloned = response.clone();
        void (async () => {
          try {
            const { text, truncated } = await readBodyTextWithLimit(
              cloned,
              MAX_STREAMABLE_LOG_BYTES,
            );
            const duration = Date.now() - startTime;

            const contentType = cloned.headers.get("content-type") ?? "";
            let body: unknown = text;
            if (contentType.includes("application/json")) {
              try {
                body = text.length ? JSON.parse(text) : null;
              } catch {
                body = text;
              }
            }

            const isError = response.status >= 400;
            const derivedErrorMessage =
              isError && body && typeof body === "object" && "error" in body
                ? (body as { error?: unknown }).error
                : undefined;
            const errorMessage =
              typeof derivedErrorMessage === "string" && derivedErrorMessage
                ? derivedErrorMessage
                : isError && typeof body === "string" && body.trim()
                  ? body.slice(0, 500)
                  : isError
                    ? `HTTP ${response.status} ${response.statusText}`.trim()
                    : truncated
                      ? `Response body truncated to ${MAX_STREAMABLE_LOG_BYTES} bytes`
                      : undefined;

            await logProxyMonitoringEvent({
              ctx,
              enabled,
              organizationId,
              connectionId,
              connectionTitle,
              request,
              output: formatMonitoringOutput(body),
              isError,
              errorMessage,
              durationMs: duration,
            });
          } catch (err) {
            const duration = Date.now() - startTime;
            await logProxyMonitoringEvent({
              ctx,
              enabled,
              organizationId,
              connectionId,
              connectionTitle,
              request,
              output: {},
              isError: true,
              errorMessage: `Failed to read streamable response body: ${
                (err as Error).message
              }`,
              durationMs: duration,
            });
          }
        })();
      }

      return response;
    } catch (error) {
      const err = error as Error;
      const duration = Date.now() - startTime;

      await logProxyMonitoringEvent({
        ctx,
        enabled,
        connectionId,
        connectionTitle,
        request,
        output: {},
        isError: true,
        errorMessage: err.message,
        durationMs: duration,
      });

      throw error;
    }
  };
}
