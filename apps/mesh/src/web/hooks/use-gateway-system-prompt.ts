/**
 * Gateway System Prompt Storage
 *
 * Manages per-gateway system prompts stored in localStorage.
 * Uses a map structure {[gatewayId]: prompt} scoped by project locator.
 */

import { useProjectContext } from "../providers/project-context-provider";
import { LOCALSTORAGE_KEYS } from "../lib/localstorage-keys";
import { useLocalStorage } from "./use-local-storage";

type GatewaySystemPromptsMap = Record<string, string>;

/**
 * Hook to manage a single gateway's system prompt
 * Returns a tuple of [value, setValue] for the specified gateway ID
 */
export function useGatewaySystemPrompt(
  gatewayId?: string,
): [string, (value: string) => void] {
  const { locator } = useProjectContext();
  const [map, setMap] = useLocalStorage<GatewaySystemPromptsMap>(
    LOCALSTORAGE_KEYS.gatewaySystemPrompts(locator),
    {},
  );

  const value = gatewayId ? (map[gatewayId] ?? "") : "";

  const setValue = (newValue: string) => {
    if (!gatewayId) return;
    setMap((prev) => ({
      ...prev,
      [gatewayId]: newValue,
    }));
  };

  return [value, setValue];
}
