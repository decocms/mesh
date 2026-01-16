import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";

import { AuthConfigProvider } from "@/web/providers/auth-config-provider";
import { BetterAuthUIProvider } from "@/web/providers/better-auth-ui-provider";
import { ThemeProvider } from "@/web/providers/theme-provider";
import { SplashScreen } from "@/web/components/splash-screen";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fresh for 1 minute by default
      staleTime: 60_000,
      // Only refetch on window focus if data is stale (respects staleTime)
      refetchOnWindowFocus: true,
      // Don't refetch on mount if data is still fresh
      refetchOnMount: true,
      // Retry failed requests (but not too aggressively)
      retry: 1,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Suspense fallback={<SplashScreen />}>
        <ThemeProvider>
          <AuthConfigProvider>
            <BetterAuthUIProvider>{children}</BetterAuthUIProvider>
          </AuthConfigProvider>
        </ThemeProvider>
      </Suspense>
    </QueryClientProvider>
  );
}
