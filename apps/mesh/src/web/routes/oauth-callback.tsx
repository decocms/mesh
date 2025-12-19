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
import { sendOAuthMessage } from "../lib/oauth-messaging";

export default function OAuthCallback() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log("[OAuthCallback] Handling OAuth callback...");
        console.log("[OAuthCallback] URL:", window.location.href);

        // Handle the OAuth callback
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        let state = params.get("state");
        const errorParam = params.get("error");
        const errorDescription = params.get("error_description");

        if (errorParam) {
          console.error(
            "[OAuthCallback] OAuth error:",
            errorParam,
            errorDescription,
          );
          setError(errorDescription || errorParam);

          // Notify parent window of error using centralized utility
          sendOAuthMessage({
            type: "mcp_auth_callback",
            success: false,
            error: errorDescription || errorParam,
          });

          // Show error and close window after delay
          setTimeout(() => {
            window.close();
          }, 3000);
          return;
        }

        if (!code) {
          throw new Error("Authorization code not found in callback");
        }

        if (!state) {
          throw new Error("State parameter not found in callback");
        }

        console.log(
          "[OAuthCallback] Code and state found, calling onMcpAuthorization...",
        );

        // Check if the state is a base64-encoded JSON object from deco.cx
        // deco.cx wraps the original state in additional metadata
        try {
          const decodedState = atob(state);
          const stateObj = JSON.parse(decodedState);

          // If the state contains a nested clientState, extract it
          if (stateObj.clientState) {
            console.log(
              "[OAuthCallback] Found nested clientState, unwrapping...",
            );
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
          console.log("[OAuthCallback] State is not base64 JSON, using as-is");
        }

        // Let use-mcp handle the authorization
        // This will:
        // 1. Get stored state data from localStorage
        // 2. Re-instantiate the provider
        // 3. Exchange the code for tokens
        // 4. Save tokens to localStorage
        // 5. Send postMessage to opener window
        await onMcpAuthorization();

        console.log(
          "[OAuthCallback] onMcpAuthorization completed successfully",
        );
        setSuccess(true);

        // onMcpAuthorization already sends the message and closes the window
        // But we'll add a backup in case it doesn't
        setTimeout(() => {
          // Send backup success message using centralized utility
          sendOAuthMessage({
            type: "mcp:oauth:complete",
            success: true,
          });
          window.close();
        }, 1000);
      } catch (err) {
        console.error("[OAuthCallback] Error during callback:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);

        // Notify parent window of error using centralized utility
        sendOAuthMessage({
          type: "mcp_auth_callback",
          success: false,
          error: errorMessage,
        });

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
            ) : success ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Authentication Successful
              </>
            ) : (
              <>
                <Icon
                  name="progress_activity"
                  size={20}
                  className="animate-spin"
                />
                Authenticating...
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="text-sm text-muted-foreground">
              <p className="mb-2">An error occurred during authentication:</p>
              <p className="text-destructive font-mono text-xs bg-destructive/10 p-2 rounded">
                {error}
              </p>
              <p className="mt-4">This window will close automatically.</p>
            </div>
          ) : success ? (
            <div className="text-sm text-muted-foreground text-center">
              <p>✅ Authentication complete!</p>
              <p className="mt-2">This window will close automatically.</p>
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
                Processing OAuth callback...
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
