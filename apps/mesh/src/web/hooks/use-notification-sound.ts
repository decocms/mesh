const notificationAudio = (() => {
  if (typeof window === "undefined") return null;
  const audio = new Audio("/sounds/notification.mp3");
  audio.preload = "auto";
  audio.addEventListener("error", (event) => {
    console.warn("Failed to preload notification sound:", event);
  });
  audio.load();
  return audio;
})();

// Track last play time to prevent overlapping sounds
let lastPlayTime = 0;
const MIN_PLAY_INTERVAL_MS = 2000; // 2 seconds cooldown

export function useNotificationSound() {
  const playNotificationSound = () => {
    if (!notificationAudio) return;

    const now = Date.now();
    if (now - lastPlayTime < MIN_PLAY_INTERVAL_MS) {
      return; // Too soon since last play
    }

    lastPlayTime = now;
    notificationAudio.currentTime = 0;
    notificationAudio.play().catch((error) => {
      console.warn("Failed to play notification sound:", error);
    });
  };

  return { playNotificationSound };
}
