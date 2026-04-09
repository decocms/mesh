import { useLocalStorage } from "./use-local-storage.ts";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys.ts";

export type ToolApprovalLevel = "auto" | "readonly" | "plan";
export type ThemeMode = "light" | "dark" | "system";
export type SoundEventKey = "completed" | "failed" | "requires_action";

interface Preferences {
  toolApprovalLevel: ToolApprovalLevel;
  enableNotifications: boolean;
  enableSounds: boolean;
  soundToggles: Record<SoundEventKey, boolean>;
  theme: ThemeMode;
}

const DEFAULT_SOUND_TOGGLES: Record<SoundEventKey, boolean> = {
  completed: true,
  failed: true,
  requires_action: true,
};

const DEFAULT_PREFERENCES: Preferences = {
  toolApprovalLevel: "auto",
  enableNotifications: typeof Notification !== "undefined" ? true : false,
  enableSounds: false,
  soundToggles: DEFAULT_SOUND_TOGGLES,
  theme: "system",
};

const VALID_TOOL_APPROVAL_LEVELS: ToolApprovalLevel[] = [
  "auto",
  "readonly",
  "plan",
];

const VALID_THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

/**
 * Read toolApprovalLevel directly from localStorage (no React state).
 * Useful when the value must be fresh outside the React render cycle.
 */
export function readToolApprovalLevel(): ToolApprovalLevel {
  try {
    const raw = JSON.parse(
      localStorage.getItem(LOCALSTORAGE_KEYS.preferences()) ?? "{}",
    );
    if (VALID_TOOL_APPROVAL_LEVELS.includes(raw.toolApprovalLevel)) {
      return raw.toolApprovalLevel;
    }
  } catch {}
  return "auto";
}

export function usePreferences() {
  return useLocalStorage<Preferences>(
    LOCALSTORAGE_KEYS.preferences(),
    (existing) => {
      const merged = { ...DEFAULT_PREFERENCES, ...existing };
      merged.soundToggles = {
        ...DEFAULT_SOUND_TOGGLES,
        ...(existing?.soundToggles ?? {}),
      };
      if (!VALID_TOOL_APPROVAL_LEVELS.includes(merged.toolApprovalLevel)) {
        merged.toolApprovalLevel = "auto";
      }
      if (!VALID_THEME_MODES.includes(merged.theme)) {
        merged.theme = "system";
      }
      return merged;
    },
  );
}
