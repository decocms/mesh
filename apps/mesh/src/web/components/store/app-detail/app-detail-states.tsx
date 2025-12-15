import { Icon } from "@deco/ui/components/icon.tsx";

interface LoadingStateProps {
  message?: string;
}

export function AppDetailLoadingState({
  message = "Loading app details...",
}: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Icon name="progress_activity" size={48} className="animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  error: Error | string;
  onBack: () => void;
}

export function AppDetailErrorState({ error, onBack }: ErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : error;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Icon name="error" size={48} className="text-destructive mb-4" />
      <h3 className="text-lg font-medium mb-2">Error loading app</h3>
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

export function AppDetailNotFoundState({ onBack }: NotFoundStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Icon
        name="search_off"
        size={48}
        className="text-muted-foreground mb-4"
      />
      <h3 className="text-lg font-medium mb-2">App not found</h3>
      <p className="text-muted-foreground max-w-md text-center">
        The app you're looking for doesn't exist in this store.
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
