import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { track } from "@/web/lib/posthog-client";
import { useProjectContext } from "@decocms/mesh-sdk";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  SettingsCard,
  SettingsCardItem,
  SettingsSection,
} from "@/web/components/settings/settings-section";
import { useState } from "react";
import { toast } from "sonner";

export function DeleteOrganizationSection() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.organization.delete({
        organizationId: org.id,
      });
      if (result?.error) {
        throw new Error(
          result.error.message || "Failed to delete organization",
        );
      }
      return result;
    },
    onSuccess: () => {
      track("organization_deleted", { organization_id: org.id });
      queryClient.invalidateQueries({ queryKey: KEYS.organizations() });
      toast.success("Organization deleted");
      navigate({ to: "/" });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete organization",
      );
    },
  });

  return (
    <>
      <SettingsSection
        title="Danger Zone"
        description="Irreversible actions that affect your entire organization."
      >
        <SettingsCard className="border-destructive/40">
          <SettingsCardItem
            title="Delete organization"
            description="Permanently delete this organization and all of its data. This action cannot be undone."
            action={
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            }
          />
        </SettingsCard>
      </SettingsSection>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{org.name}</span>{" "}
              and all of its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete organization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
