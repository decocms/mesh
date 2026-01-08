import { Loading01, AlertCircle, SearchLg } from "@untitledui/icons";

interface LoadingStateProps {
  message?: string;
}

export function MCPServerDetailLoadingState({
  message = "Loading MCP Server details...",
}: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Loading01 size={48} className="animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  error: Error | string;
  onBack: () => void;
}

export function MCPServerDetailErrorState({ error, onBack }: ErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : error;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <AlertCircle size={48} className="text-destructive mb-4" />
      <h3 className="text-lg font-medium mb-2">Error loading MCP Server</h3>
      <p className="text-muted-foreground max-w-md text-center">
        {errorMessage}
      </p>
      <button
        onClick={onBack}
        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
      >
        Go Back
      </button>
    </div>
  );
}

interface NotFoundStateProps {
  onBack: () => void;
}

export function MCPServerDetailNotFoundState({ onBack }: NotFoundStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <SearchLg size={48} className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">MCP Server not found</h3>
      <p className="text-muted-foreground max-w-md text-center">
        The MCP Server you're looking for doesn't exist in this store.
      </p>
      <button
        onClick={onBack}
        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
      >
        Go Back to Store
      </button>
    </div>
  );
}

