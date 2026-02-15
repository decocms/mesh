import { useLocalStorage } from "./use-local-storage.ts";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys.ts";

export type ToolApprovalLevel = "none" | "readonly" | "yolo";

interface Preferences {
  devMode: boolean;
  experimental_projects: boolean;
  experimental_tasks: boolean;
  toolApprovalLevel: ToolApprovalLevel;
  soundNotificationsEnabled: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  devMode: false,
  experimental_projects: false,
  experimental_tasks: false,
  toolApprovalLevel: "none",
  soundNotificationsEnabled: true,
};

export function usePreferences() {
  return useLocalStorage<Preferences>(
    LOCALSTORAGE_KEYS.preferences(),
    DEFAULT_PREFERENCES,
  );
}
