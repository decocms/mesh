/**
 * Syncs the Better Auth session into PostHog.
 *
 * - Calls `identify` when a logged-in user is present.
 * - Calls `reset` when the session clears (logout).
 *
 * No-op when PostHog isn't configured (missing `VITE_POSTHOG_KEY`).
 */

import { authClient } from "@/web/lib/auth-client";
import {
  identifyUser,
  isPostHogEnabled,
  resetUser,
} from "@/web/lib/posthog-client";

let lastUserId: string | null = null;

export function PostHogIdentitySync({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = authClient.useSession();

  if (isPostHogEnabled) {
    const userId = session?.user?.id ?? null;

    if (userId && userId !== lastUserId) {
      identifyUser(userId, {
        email: session?.user?.email,
        name: session?.user?.name,
      });
      lastUserId = userId;
    } else if (!userId && lastUserId) {
      resetUser();
      lastUserId = null;
    }
  }

  return <>{children}</>;
}
