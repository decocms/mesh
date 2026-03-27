import type { ThreadStatus } from "@decocms/mesh-sdk";
import { playSound } from "@deco/ui/lib/sound-engine.ts";
import { error005Sound } from "@deco/ui/lib/error-005.ts";
import { successChimeSound } from "@deco/ui/lib/success-chime.ts";
import { question004Sound } from "@deco/ui/lib/question-004.ts";
import { useDecopilotEvents } from "./use-decopilot-events";
import { usePreferences, type SoundEventKey } from "./use-preferences";

export const SOUND_MAP: Partial<Record<SoundEventKey, { dataUri: string }>> = {
  completed: successChimeSound,
  failed: error005Sound,
  requires_action: question004Sound,
};

function playSoundForStatus(
  status: string,
  toggles: Record<SoundEventKey, boolean>,
) {
  const key = status as SoundEventKey;
  if (toggles[key] === false) return;
  const sound = SOUND_MAP[key];
  if (sound) {
    playSound(sound.dataUri).catch((err: unknown) => {
      console.warn("[status-sounds] playback failed:", err);
    });
  }
}

/**
 * Play a sound for a given thread status, respecting the user's sound preferences.
 * Can be used imperatively (e.g. on "Mark as done" click).
 */
export function usePlayStatusSound() {
  const [preferences] = usePreferences();

  return (status: ThreadStatus) => {
    if (!preferences.enableSounds) return;
    playSoundForStatus(status, preferences.soundToggles);
  };
}

/**
 * Subscribe to org-wide SSE thread status events and play corresponding sounds.
 * Mount once at the app layout level.
 */
export function useStatusSounds(orgId: string) {
  const [preferences] = usePreferences();

  useDecopilotEvents({
    orgId,
    onTaskStatus: (event) => {
      if (!preferences.enableSounds) return;
      playSoundForStatus(event.data.status, preferences.soundToggles);
    },
  });
}
