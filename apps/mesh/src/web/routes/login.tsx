import { useEffect } from "react";
import { useAuthConfig } from "@/web/providers/auth-config-provider";
import { SplashScreen } from "@/web/components/splash-screen";
import { authClient } from "@/web/lib/auth-client";
import { Navigate, useSearch } from "@tanstack/react-router";
import { UnifiedAuthForm } from "@/web/components/unified-auth-form";

function RunSSO({
  callbackURL,
  providerId,
}: {
  providerId: string;
  callbackURL: string;
}) {
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    (async () => {
      await authClient.signIn.sso({
        providerId,
        callbackURL,
      });
    })();
  }, [providerId, callbackURL]);

  return <SplashScreen />;
}

export default function LoginRoute() {
  const session = authClient.useSession();
  const { next = "/" } = useSearch({ from: "/login" });
  const { sso, emailAndPassword, magicLink, socialProviders } = useAuthConfig();

  if (session.data) {
    return <Navigate to={next} />;
  }

  if (sso.enabled) {
    return <RunSSO callbackURL={next} providerId={sso.providerId} />;
  }

  // Render unified auth form if any standard auth method is enabled
  if (
    emailAndPassword.enabled ||
    magicLink.enabled ||
    socialProviders.enabled
  ) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-primary to-primary/75 p-4">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle, var(--primary-foreground) 1px, transparent 1px)`,
            backgroundSize: "16px 16px",
            opacity: 0.15,
          }}
        />

        <div className="relative z-10">
          {/* Blueprint lines - glued to card edges, extending full screen */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-px bg-primary-foreground/15" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-screen h-px bg-primary-foreground/15" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-screen bg-primary-foreground/15" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-screen bg-primary-foreground/15" />

          <UnifiedAuthForm />
        </div>
      </main>
    );
  }

  return <div>No login options available</div>;
}
