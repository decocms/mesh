/**
 * Model State Hook
 *
 * Manages model selection state with connection validation and persistence.
 */

import type { ConnectionEntity } from "./collections/use-connection";
import { useModels } from "../components/chat";
import { useLocalStorage } from "./use-local-storage";
import { LOCALSTORAGE_KEYS } from "../lib/localstorage-keys";
import type { ProjectLocator } from "../lib/locator";

/**
 * Find an item by id in an array, or return the first item, or null
 */
const findOrFirst = <T extends { id: string }>(array?: T[], id?: string) =>
  array?.find((item) => item.id === id) ?? array?.[0] ?? null;

/**
 * Hook to manage model selection state with connection validation
 *
 * @param locator - Project locator for localStorage key
 * @param modelsConnections - Array of available model connections
 * @returns Tuple of [selectedModelState, setModelState]
 */
export const useModelState = (
  locator: ProjectLocator,
  modelsConnections: ConnectionEntity[],
) => {
  const [modelState, setModelState] = useLocalStorage<{
    id: string;
    connectionId: string;
  } | null>(LOCALSTORAGE_KEYS.chatSelectedModel(locator), null);

  // Determine connectionId to use (from stored selection or first available)
  // Ensure we always have a valid connection if any are available
  const modelsConnection = findOrFirst(
    modelsConnections,
    modelState?.connectionId,
  );

  // Fetch models for the selected connection
  const models = useModels(modelsConnection?.id ?? null);

  // Find the selected model from the fetched models using stored state
  const selectedModel = findOrFirst(models, modelState?.id);

  const selectedModelState =
    selectedModel && modelsConnection?.id
      ? {
          id: selectedModel.id,
          provider: selectedModel.provider,
          limits: selectedModel.limits,
          connectionId: modelsConnection.id,
        }
      : null;

  return [selectedModelState, setModelState] as const;
};
