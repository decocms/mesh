/**
 * Virtual MCP System Prompt Storage
 *
 * Manages per-virtual-MCP system prompts stored in localStorage.
 * Uses a map structure {[virtualMcpId]: prompt} scoped by project locator.
 */

import { useProjectContext } from "@decocms/mesh-sdk";
import { LOCALSTORAGE_KEYS } from "../lib/localstorage-keys";
import { useLocalStorage } from "./use-local-storage";

type VirtualMCPSystemPromptsMap = Record<string, string>;

/**
 * Hook to manage a single virtual MCP's system prompt
 * Returns a tuple of [value, setValue] for the specified virtual MCP ID
 */
export function useVirtualMCPSystemPrompt(
  virtualMcpId?: string,
): [string, (value: string) => void] {
  const { locator } = useProjectContext();
  const [map, setMap] = useLocalStorage<VirtualMCPSystemPromptsMap>(
    LOCALSTORAGE_KEYS.virtualMcpSystemPrompts(locator),
    {},
  );

  const value = virtualMcpId ? (map[virtualMcpId] ?? "") : "";

  const setValue = (newValue: string) => {
    if (!virtualMcpId) return;
    setMap((prev) => ({
      ...prev,
      [virtualMcpId]: newValue,
    }));
  };

  return [value, setValue];
}
