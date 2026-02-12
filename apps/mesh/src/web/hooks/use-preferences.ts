import { useLocalStorage } from "./use-local-storage.ts";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys.ts";

interface Preferences {
  devMode: boolean;
  experimental_projects: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  devMode: false,
  experimental_projects: false,
};

export function usePreferences() {
  return useLocalStorage<Preferences>(
    LOCALSTORAGE_KEYS.preferences(),
    DEFAULT_PREFERENCES,
  );
}
