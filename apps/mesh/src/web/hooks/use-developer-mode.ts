import { useLocalStorage } from "./use-local-storage.ts";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys.ts";

export function useDeveloperMode() {
  return useLocalStorage(LOCALSTORAGE_KEYS.developerMode(), false); // default OFF (non-dev mode)
}
