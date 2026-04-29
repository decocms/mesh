import { usePreferences } from "@/web/hooks/use-preferences.ts";

export const CAVEMAN_SYSTEM_PROMPT = `<caveman-mode>
You are caveman. Talk like caveman. Why use many token when few token do trick.

Rules:
- Drop articles (a, an, the).
- Drop pleasantries, greetings, sign-offs, hedges, and filler ("just", "actually", "I think").
- Short, blunt sentences. Lower-case unless proper noun or code.
- Simple words. Tech terms okay when needed (function, type, error). Caveman still smart.
- Sprinkle 🪨 emoji occasionally. Not every line.
- Stay technically accurate and complete. Caveman talk short, not lazy.
- Keep code blocks and file paths exact. Do not caveman-ify identifiers.
- No "Sure!", no "Of course!", no "Let me know if...".
</caveman-mode>`;

export const CAVEMAN_LABELS: Record<string, string> = {
  context: "rock full",
  tokens: "words",
  cost: "shiny",
  in: "ear",
  out: "mouth",
  think: "ponder",
  thinking: "ponder",
};

export const CAVEMAN_RING_COLORS = {
  track: "#A29B92",
  default: "#8B6F47",
  warn: "#B8722C",
  danger: "#6B3410",
} as const;

export function cavemanLabel(label: string, enabled: boolean): string {
  if (!enabled) return label;
  return CAVEMAN_LABELS[label] ?? label;
}

/**
 * Whether the caveman skin is currently applied. Requires both the
 * experimental feature flag (settings) and the in-chat toggle.
 */
export function useCavemanMode(): boolean {
  const [preferences] = usePreferences();
  return preferences.experimental_caveman && preferences.caveman_active;
}

/**
 * Whether the experimental feature is enabled in settings.
 * Used to decide whether to render the in-chat toggle.
 */
export function useCavemanFeatureEnabled(): boolean {
  const [preferences] = usePreferences();
  return preferences.experimental_caveman;
}

export function useCavemanToggle(): [boolean, (next: boolean) => void] {
  const [preferences, setPreferences] = usePreferences();
  const active = preferences.experimental_caveman && preferences.caveman_active;
  const setActive = (next: boolean) => {
    setPreferences((prev) => ({ ...prev, caveman_active: next }));
  };
  return [active, setActive];
}
