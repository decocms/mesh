import { useNavigate, useSearch } from "@tanstack/react-router";

/**
 * Standalone hook to focus the Env (VM/server) tab in the main panel.
 *
 * Drives the same `?main=<tabId>` querystring contract that
 * `useChatMainPanelState` reads, so call sites outside the agent shell
 * (preview overlays, booting/suspended states) can deep-link the user
 * into the Env tab without pulling in the full panel-state hook.
 *
 * `toggleEnv` collapses the main panel back to closed (`?main=0`) when
 * Env is already active, matching the behavior of the header tab bar.
 */
const ENV_TAB_ID = "env";

export function useToggleEnvPanel() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { main?: string };
  const envOpen = search.main === ENV_TAB_ID;

  const setMain = (value: string) => {
    navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        main: value,
      })) as any,
      replace: true,
    });
  };

  const toggleEnv = () => {
    setMain(envOpen ? "0" : ENV_TAB_ID);
  };

  const openEnv = () => {
    if (envOpen) return;
    setMain(ENV_TAB_ID);
  };

  return { envOpen, toggleEnv, openEnv };
}
