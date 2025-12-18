import { useEffect, useState } from "react";
import { onMcpAuthorization } from "use-mcp";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function OAuthCallback() {
  const [error, setError] = useState<string | null>(null);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Handle the OAuth callback
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        let state = params.get("state");
        const errorParam = params.get("error");
        const errorDescription = params.get("error_description");

        if (errorParam) {
          console.error("OAuth error:", errorParam, errorDescription);
          setError(errorDescription || errorParam);
          // Show error and close window after delay
          setTimeout(() => {
            window.close();
          }, 3000);
          return;
        }

        if (code && state) {
          // Check if the state is a base64-encoded JSON object from deco.cx
          // deco.cx wraps the original state in additional metadata
          try {
            const decodedState = atob(state);
            const stateObj = JSON.parse(decodedState);

            // If the state contains a nested clientState, extract it
            if (stateObj.clientState) {
              // Replace the state parameter with the actual client state
              const url = new URL(window.location.href);
              url.searchParams.set("state", stateObj.clientState);

              // Update the browser URL without reloading
              window.history.replaceState({}, "", url.toString());

              // Update state for the authorization call
              state = stateObj.clientState;
            }
          } catch {
            // If decoding/parsing fails, use the state as-is
          }

          // Let use-mcp handle the authorization with the unwrapped state
          await onMcpAuthorization();

          // Notify parent window that OAuth is complete
          // The parent window will handle saving the token to the database
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              {
                type: "mcp:oauth:complete",
                success: true,
              },
              window.location.origin,
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setTimeout(() => {
          window.close();
        }, 3000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {error ? (
              <>
                <AlertCircle className="h-5 w-5 text-destructive" />
                Authentication Failed
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Authentication Successful
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="text-sm text-muted-foreground">
              <p className="mb-2">An error occurred during authentication:</p>
              <p className="text-destructive">{error}</p>
              <p className="mt-4">This window will close automatically.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center py-4">
                <Icon
                  name="progress_activity"
                  size={32}
                  className="animate-spin text-primary"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Authentication complete. This window will close automatically.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
