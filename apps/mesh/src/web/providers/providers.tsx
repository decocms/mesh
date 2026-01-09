import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";

import { AuthConfigProvider } from "@/web/providers/auth-config-provider";
import { BetterAuthUIProvider } from "@/web/providers/better-auth-ui-provider";
import { ThemeProvider } from "@/web/providers/theme-provider";
import { Toaster } from "sonner";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Suspense>
        <ThemeProvider>
          <AuthConfigProvider>
            <BetterAuthUIProvider>{children}</BetterAuthUIProvider>
          </AuthConfigProvider>
        </ThemeProvider>
      </Suspense>
    </QueryClientProvider>
  );
}
