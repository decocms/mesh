import { Link, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/web/lib/auth-client";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import type { PropsWithChildren } from "react";

export function BetterAuthUIProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();

  const handleNavigate = (href: string) => {
    // Check if there's a callbackURL in current URL before navigating
    const urlParams = new URLSearchParams(window.location.search);
    const callbackURL = urlParams.get("callbackURL");

    // If navigating to home/root and we have a callbackURL, use that instead
    if (callbackURL && (href === "/" || href === "")) {
      console.log(
        "[BetterAuthUI] Intercepting navigate, using callbackURL:",
        callbackURL,
      );
      window.location.href = decodeURIComponent(callbackURL);
      return;
    }

    // Normal navigation
    navigate({ to: href });
  };

  return (
    <AuthUIProvider
      authClient={authClient}
      organization={{
        basePath: "/",
        pathMode: "slug",
      }}
      navigate={handleNavigate}
      replace={(href) => handleNavigate(href)}
      Link={({ href, className, children, ...props }) => (
        <Link to={href} className={className} {...props}>
          {children}
        </Link>
      )}
    >
      {children}
    </AuthUIProvider>
  );
}
