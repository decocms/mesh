import { createContext, useContext, type ReactNode } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { AuthConfig } from "@/api/routes/auth";
import { KEYS } from "@/web/lib/query-keys";

const AuthConfigContext = createContext<AuthConfig | undefined>(undefined);

async function fetchAuthConfig(): Promise<AuthConfig> {
  const response = await fetch("/api/auth/custom/config");
  if (!response.ok) {
    throw new Error("Failed to load auth configuration");
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to load auth configuration");
  }
  return data.config;
}

export function AuthConfigProvider({ children }: { children: ReactNode }) {
  const { data: authConfig } = useSuspenseQuery({
    queryKey: KEYS.authConfig(),
    queryFn: fetchAuthConfig,
    staleTime: Infinity,
  });

  return (
    <AuthConfigContext.Provider value={authConfig}>
      {children}
    </AuthConfigContext.Provider>
  );
}

export function useAuthConfig() {
  const context = useContext(AuthConfigContext);
  if (context === undefined) {
    throw new Error("useAuthConfig must be used within AuthConfigProvider");
  }
  return context;
}
