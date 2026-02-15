const notificationAudio = (() => {
  if (typeof window === "undefined") return null;
  const audio = new Audio("/sounds/notification.mp3");
  audio.preload = "auto";
  audio.load().catch((error) => {
    console.warn("Failed to preload notification sound:", error);
  });
  return audio;
})();

export function useNotificationSound() {
  const playNotificationSound = () => {
    if (notificationAudio) {
      notificationAudio.currentTime = 0;
      notificationAudio.play().catch((error) => {
        console.warn("Failed to play notification sound:", error);
      });
    }
  };

  return { playNotificationSound };
}
