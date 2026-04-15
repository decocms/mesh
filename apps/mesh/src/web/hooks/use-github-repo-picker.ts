import { useState } from "react";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { useVirtualMCPActions } from "@decocms/mesh-sdk";

/**
 * Manages the GitHub repo picker dialog state.
 * Resets `metadata.githubRepo` when opening the dialog so the
 * picker always starts fresh.
 */
export function useGithubRepoPicker() {
  const [open, setOpen] = useState(false);
  const inset = useInsetContext();
  const actions = useVirtualMCPActions();

  const openPicker = async () => {
    if (inset?.entity) {
      await actions.update.mutateAsync({
        id: inset.entity.id,
        data: {
          metadata: {
            githubRepo: null,
          },
        } as any,
      });
    }
    setOpen(true);
  };

  return { open, setOpen, openPicker };
}
