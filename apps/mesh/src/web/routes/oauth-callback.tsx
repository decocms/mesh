import { useEffect, useState } from "react";
import { handleOAuthCallback } from "@/web/lib/mcp-oauth";
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
  const [success, setSuccess] = useState(false);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const processCallback = async () => {
      try {
        const result = await handleOAuthCallback();

        if (!result.success) {
          setError(result.error || "OAuth authentication failed");
          // Show error and close window after delay
          setTimeout(() => {
            window.close();
          }, 3000);
          return;
        }

        setSuccess(true);

        // Notify parent window that OAuth is complete
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: "mcp:oauth:complete",
              success: true,
            },
            window.location.origin,
          );
        }

        // Close popup after a short delay
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
                Processing...
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
                <Icon
                  name="progress_activity"
                  size={32}
                  className="animate-spin text-primary"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Completing authentication...
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
