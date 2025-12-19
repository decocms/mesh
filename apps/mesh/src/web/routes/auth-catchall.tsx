import { useParams } from "@tanstack/react-router";
import { AuthView } from "@daveyplate/better-auth-ui";

export default function AuthPage() {
  const { pathname } = useParams({ from: "/auth/$pathname" });

  // BetterAuthUIProvider will handle callbackURL redirect after login

  return (
    <main className="container mx-auto flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <AuthView pathname={pathname} />
    </main>
  );
}
