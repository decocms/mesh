import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import { CheckCircle, AlertCircle, Loading01 } from "@untitledui/icons";
import { handleOAuthCallback } from "@/web/lib/mcp-oauth";

export default function OAuthCallback() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const processCallback = async () => {
      try {
        // handleOAuthCallback forwards the code/state to parent window via postMessage
        // The parent window handles the token exchange (it has the provider in memory)
        const result = await handleOAuthCallback();

        if (!result.success) {
          setError(result.error || "MCP authentication failed");
          setTimeout(() => {
            window.close();
          }, 3000);
          return;
        }

        setSuccess(true);

        // Close after a brief delay to show success message
        setTimeout(() => {
          window.close();
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setTimeout(() => {
          window.close();
        }, 3000);
      }
    };

    processCallback();
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
                <CheckCircle className="h-5 w-5 text-green-600" />
                Authentication Successful
              </>
            ) : (
              <>
                <Loading01 className="h-5 w-5 animate-spin" />
                Authentication in progress...
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
          ) : success ? (
            <p className="text-sm text-muted-foreground text-center">
              Authentication complete. This window will close automatically.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-center py-4">
                <Loading01 size={32} className="animate-spin text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Processing authentication...
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
