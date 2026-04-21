import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@decocms/ui/components/alert-dialog.tsx";
import type { DeleteConnectionState } from "@/web/hooks/use-delete-connection";

export function DeleteConnectionDialogs({
  deleteState,
  cancelDelete,
  confirmDelete,
  confirmForceDelete,
}: {
  deleteState: DeleteConnectionState;
  cancelDelete: () => void;
  confirmDelete: () => void;
  confirmForceDelete: () => void;
}) {
  return (
    <>
      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteState.mode === "deleting"}
        onOpenChange={(open) => {
          if (!open) cancelDelete();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteState.mode === "deleting" &&
                  deleteState.connection.title}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteState.mode === "force-deleting"}
        onOpenChange={(open) => {
          if (!open) cancelDelete();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Connection Used by Agents</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  The connection{" "}
                  <span className="font-medium text-foreground">
                    {deleteState.mode === "force-deleting" &&
                      deleteState.connection.title}
                  </span>{" "}
                  is currently used by the following agent(s):{" "}
                  <span className="font-medium text-foreground">
                    {deleteState.mode === "force-deleting" &&
                      deleteState.agentNames}
                  </span>
                  .
                </p>
                <p className="mt-2">
                  Deleting this connection will remove it from those agents,
                  which may impact existing workflows that depend on them.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmForceDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
