import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { AlertTriangle } from "@untitledui/icons";

/**
 * Props for the fallback render function
 */
export interface ErrorFallbackProps {
  error: Error | null;
  resetError: () => void;
}

/**
 * Fallback can be either a static ReactNode or a render function
 */
type FallbackType = ReactNode | ((props: ErrorFallbackProps) => ReactNode);

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
  }

  private resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      const { fallback } = this.props;

      // If fallback is a function, call it with error props
      if (typeof fallback === "function") {
        return fallback({
          error: this.state.error,
          resetError: this.resetError,
        });
      }

      // If fallback is provided as a static node, use it
      if (fallback !== undefined) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div className="flex-1 flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
          <div className="bg-destructive/10 p-3 rounded-full">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Something went wrong</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
          </div>
          <Button variant="outline" onClick={this.resetError}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
