import { useNavigate, useSearch } from "@tanstack/react-router";

/**
 * Standalone hook to toggle the env (VM/server) panel via URL search params.
 * Opens the main panel when opening env. Can be used from any component
 * without needing the full usePanelState context.
 */
export function useToggleEnvPanel() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { env?: number };
  const envOpen = search.env === 1;

  const toggleEnv = () => {
    const updates = envOpen ? { env: 0 } : { env: 1, mainOpen: 1 };
    navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        ...updates,
      })) as any,
      replace: true,
    });
  };

  const openEnv = () => {
    if (envOpen) return;
    navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        env: 1,
        mainOpen: 1,
      })) as any,
      replace: true,
    });
  };

  return { envOpen, toggleEnv, openEnv };
}
