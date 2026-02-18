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

interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
}

export function useNotification() {
  const showNotification = (options: NotificationOptions) => {
    const { title, body, icon = "/favicon.svg", tag } = options;

    // Check if we should show notifications (all conditions must be met)
    const shouldNotify =
      typeof document !== "undefined" &&
      !document.hasFocus() &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted";

    if (!shouldNotify) return;

    // Check debounce to prevent overlapping notifications
    const now = Date.now();
    if (now - lastPlayTime < MIN_PLAY_INTERVAL_MS) {
      return; // Too soon since last notification
    }
    lastPlayTime = now;

    // Play notification sound
    if (notificationAudio) {
      notificationAudio.currentTime = 0;
      notificationAudio.play().catch((error) => {
        console.warn("Failed to play notification sound:", error);
      });
    }

    // Show browser notification
    const notification = new Notification(title, {
      body,
      icon,
      tag,
    });

    // Focus window when notification is clicked
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  };

  return { showNotification };
}
