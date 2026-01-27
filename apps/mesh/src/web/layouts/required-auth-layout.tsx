import { Navigate, useRouterState } from "@tanstack/react-router";
import { AuthLoading, SignedIn, SignedOut } from "@daveyplate/better-auth-ui";
import { SplashScreen } from "@/web/components/splash-screen";

function RedirectToLogin() {
  const routerState = useRouterState();
  const currentUrl = routerState.location.href;

  return <Navigate to="/login" search={{ next: currentUrl }} replace />;
}

export default function RequiredAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AuthLoading>
        <SplashScreen />
      </AuthLoading>

      <SignedIn>{children}</SignedIn>

      <SignedOut>
        <RedirectToLogin />
      </SignedOut>
    </>
  );
}
