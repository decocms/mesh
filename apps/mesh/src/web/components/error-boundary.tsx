import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MessageCircle01,
  RefreshCw01,
} from "@untitledui/icons";
import { captureException } from "@/web/lib/posthog-client";

const SUPPORT_EMAIL = "contact@decocms.com";
const CHUNK_RELOAD_KEY = "__mesh_chunk_reload_ts";

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message || "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    (msg.includes("Failed to fetch") && error.name === "TypeError")
  );
}

function getReadableError(error: Error | null): string {
  if (!error) return "An unexpected error occurred.";
  const msg = error.message;
  if (!msg) return "An unexpected error occurred.";

  // Short, human-looking messages: use as-is
  if (msg.length <= 120 && !msg.trimStart().startsWith("{")) {
    return msg;
  }

  // Try extracting a readable field from a JSON payload
  try {
    const parsed = JSON.parse(msg);
    const candidate = parsed?.message ?? parsed?.error ?? parsed?.detail;
    if (
      typeof candidate === "string" &&
      candidate.length <= 200 &&
      !candidate.trimStart().startsWith("{")
    ) {
      return candidate;
    }
  } catch {
    // not JSON — fall through
  }

  // Common patterns
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("net::ERR")
  ) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (msg.includes("401") || msg.includes("Unauthorized")) {
    return "Your session may have expired. Try refreshing the page.";
  }
  if (msg.includes("403") || msg.includes("Forbidden")) {
    return "You don't have permission to perform this action.";
  }
  if (msg.includes("404") || msg.includes("Not Found")) {
    return "The requested resource was not found.";
  }
  if (msg.includes("500") || msg.includes("Internal server error")) {
    return "The server encountered an error. Please try again in a moment.";
  }

  return "An unexpected error occurred. If this keeps happening, please contact support.";
}

function buildSupportMailto(error: Error | null): string {
  const subject = encodeURIComponent("Error report — MCP Mesh");
  const body = encodeURIComponent(
    [
      "Hi, I ran into an error in MCP Mesh and could use some help.",
      "",
      `Page: ${typeof window !== "undefined" ? window.location.href : "unknown"}`,
      `Error: ${error?.message ?? "Unknown"}`,
    ].join("\n"),
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export interface ErrorFallbackProps {
  error: Error | null;
  resetError: () => void;
}

type FallbackType = ReactNode | ((props: ErrorFallbackProps) => ReactNode);

interface ErrorDisplayProps {
  error: Error | null;
  onReset: () => void;
  fullPage?: boolean;
}

function ErrorDisplay({ error, onReset, fullPage }: ErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);
  const readableMessage = getReadableError(error);
  const rawMessage = error?.message ?? "";
  const hasDetails = rawMessage.length > 0 && rawMessage !== readableMessage;

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 text-center gap-4 ${
        fullPage ? "min-h-dvh" : "flex-1 h-full"
      }`}
    >
      <div className="bg-destructive/10 p-3 rounded-full">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-semibold">Something went wrong</h3>
        <p className="text-sm text-muted-foreground">{readableMessage}</p>
      </div>

      <div className="flex gap-2 flex-wrap justify-center">
        <Button variant="outline" onClick={onReset}>
          Try again
        </Button>
        <Button variant="ghost" asChild>
          <a href={buildSupportMailto(error)}>
            <MessageCircle01 className="h-4 w-4 mr-2" />
            Contact support
          </a>
        </Button>
      </div>

      {hasDetails && (
        <div className="w-full max-w-sm text-left">
          <button
            className="text-xs text-muted-foreground/60 flex items-center gap-1 mx-auto hover:text-muted-foreground transition-colors"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {showDetails ? "Hide" : "Show"} technical details
          </button>
          {showDetails && (
            <pre className="mt-2 text-xs bg-muted rounded-md p-3 overflow-auto max-h-40 text-muted-foreground whitespace-pre-wrap break-all">
              {rawMessage}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  children: ReactNode;
  fallback?: FallbackType;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    captureException(error, {
      boundary: "default",
      error_name: error.name,
      error_message: error.message,
      component_stack: errorInfo.componentStack ?? null,
      route: typeof window !== "undefined" ? window.location.pathname : null,
    });
  }

  private resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      const { fallback } = this.props;

      if (typeof fallback === "function") {
        return fallback({
          error: this.state.error,
          resetError: this.resetError,
        });
      }

      if (fallback !== undefined) {
        return fallback;
      }

      return (
        <ErrorDisplay error={this.state.error} onReset={this.resetError} />
      );
    }

    return this.props.children;
  }
}

export class ChunkErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  override state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    const isChunk = isChunkLoadError(error);
    captureException(error, {
      boundary: "chunk_root",
      is_chunk_load_error: isChunk,
      error_name: error.name,
      error_message: error.message,
      component_stack: errorInfo.componentStack ?? null,
      route: typeof window !== "undefined" ? window.location.pathname : null,
    });

    if (!isChunk) return;

    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const now = Date.now();
    if (!lastReload || now - Number(lastReload) > 10_000) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
      window.location.reload();
    }
  }

  override render() {
    if (this.state.hasError && isChunkLoadError(this.state.error)) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center gap-4">
          <div className="bg-primary/10 p-3 rounded-full">
            <RefreshCw01 className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">New version available</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              A new version has been deployed. Refresh to continue.
            </p>
          </div>
          <Button onClick={() => window.location.reload()}>Refresh</Button>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onReset={() => this.setState({ hasError: false, error: null })}
          fullPage
        />
      );
    }

    return this.props.children;
  }
}
