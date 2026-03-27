import { toast } from "@deco/ui/components/sonner.js";

interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
}

export function useNotification() {
  const showNotification = async (options: NotificationOptions) => {
    const { title, body, icon = "/favicon.svg", tag } = options;

    if (typeof Notification === "undefined") {
      return;
    }

    // If notifications are not granted, request permission so next time we can show notifications
    if (Notification.permission !== "granted") {
      Notification.requestPermission().then((result) => {
        if (result === "denied") {
          toast.error(
            "Notifications denied. Please enable them in your browser settings.",
          );
        }
      });

      return;
    }

    // Only show notifications when document is unfocused (user in another tab)
    if (document?.hasFocus()) return;

    // Show browser notification (Notification is defined here due to guard above)
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
