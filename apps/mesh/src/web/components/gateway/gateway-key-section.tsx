/**
 * Gateway Key Section for Gateway Detail
 *
 * Allows users to generate and manage gateway keys for programmatic gateway access.
 */

import { Suspense, useState } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  Key01,
  Plus,
  Copy01,
  Check,
  Trash01,
  Loading01,
  AlertTriangle,
  DotsVertical,
  Edit01,
  Eye,
  EyeOff,
} from "@untitledui/icons";
import { toast } from "sonner";
import {
  useGatewayKeys,
  useGatewayKeyActions,
  createGatewayPermissions,
  hasGatewayPermission,
  type GatewayKeyWithValue,
} from "@/web/hooks/use-gateway-keys";
import { ErrorBoundary } from "@/web/components/error-boundary";

interface GatewayKeySectionProps {
  gatewayId: string;
  gatewayTitle: string;
}

/**
 * Dialog to create a new gateway key
 */
function CreateKeyDialog({
  gatewayId,
  gatewayTitle,
  open,
  onOpenChange,
  onKeyCreated,
}: {
  gatewayId: string;
  gatewayTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyCreated: (key: GatewayKeyWithValue) => void;
}) {
  const [name, setName] = useState(`${gatewayTitle} Gateway Key`);
  const [createdKey, setCreatedKey] = useState<GatewayKeyWithValue | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const actions = useGatewayKeyActions();

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setCreatedKey(null);
      setName(`${gatewayTitle} Gateway Key`);
      setCopied(false);
      setShowKey(false);
    }
    onOpenChange(isOpen);
  };

  const handleCreate = async () => {
    const result = await actions.create.mutateAsync({
      name,
      permissions: createGatewayPermissions(gatewayId),
    });
    setCreatedKey(result);
  };

  const handleCopy = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      toast.success("Gateway key copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDone = async () => {
    if (createdKey && name.trim() !== createdKey.name) {
      // Update the key name if it changed
      try {
        await actions.update.mutateAsync({
          keyId: createdKey.id,
          name: name.trim(),
        });
      } catch (error) {
        // If update fails, show error but still close
        console.error("Failed to update key name:", error);
      }
    }
    if (createdKey) {
      onKeyCreated(createdKey);
    }
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key01 className="h-5 w-5" />
            Create Gateway Key
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Gateway Key name"
            />
          </div>
          {createdKey && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  value={
                    showKey
                      ? createdKey.key
                      : `${createdKey.key.slice(0, 12)}${"*".repeat(Math.max(0, createdKey.key.length - 12))}`
                  }
                  readOnly
                  className="font-mono text-sm"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {showKey ? "Hide key" : "Show key"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                      >
                        {copied ? <Check size={16} /> : <Copy01 size={16} />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy to clipboard</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  Store this key securely. It will not be shown again.
                </span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {createdKey ? "Close" : "Cancel"}
          </Button>
          {!createdKey ? (
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || actions.create.isPending}
            >
              {actions.create.isPending && (
                <Loading01 size={16} className="mr-2 animate-spin" />
              )}
              Create Key
            </Button>
          ) : (
            <Button onClick={handleDone}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Format date to short format like "1d ago", "4mo ago"
 */
function formatShortDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return `${diffYears}y ago`;
  if (diffMonths > 0) return `${diffMonths}mo ago`;
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "just now";
}

/**
 * List of gateway keys for this gateway
 */
function GatewayKeyList({ gatewayId }: { gatewayId: string }) {
  const { gatewayKeys } = useGatewayKeys();
  const actions = useGatewayKeyActions();
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [renameKeyId, setRenameKeyId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Filter to only show keys for this gateway
  const keys = gatewayKeys.filter((key) =>
    hasGatewayPermission(key.permissions, gatewayId),
  );

  const handleDelete = async () => {
    if (deleteKeyId) {
      await actions.delete.mutateAsync(deleteKeyId);
      setDeleteKeyId(null);
    }
  };

  const handleRename = async () => {
    if (renameKeyId && renameName.trim()) {
      await actions.update.mutateAsync({
        keyId: renameKeyId,
        name: renameName.trim(),
      });
      setRenameKeyId(null);
      setRenameName("");
    }
  };

  if (keys.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {keys.map((key) => (
          <div
            key={key.id}
            className="group flex items-center justify-between gap-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Key01 size={14} className="text-muted-foreground shrink-0" />
              <p className="text-sm font-medium truncate">{key.name}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-xs text-muted-foreground h-7 flex items-center ${openDropdownId === key.id ? "hidden" : "group-hover:hidden"}`}
              >
                {formatShortDate(new Date(key.createdAt))}
              </span>
              <DropdownMenu
                open={openDropdownId === key.id}
                onOpenChange={(open) => {
                  if (!open) {
                    // Immediately set state to prevent repositioning flash
                    setOpenDropdownId(null);
                  } else {
                    setOpenDropdownId(key.id);
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${openDropdownId === key.id ? "flex" : "hidden group-hover:flex"}`}
                  >
                    <DotsVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                {openDropdownId === key.id && (
                  <DropdownMenuContent
                    align="end"
                    sideOffset={4}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    onInteractOutside={(e) => {
                      // Prevent any repositioning during close
                      e.preventDefault();
                      setOpenDropdownId(null);
                    }}
                  >
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameKeyId(key.id);
                        setRenameName(key.name);
                        setOpenDropdownId(null);
                      }}
                    >
                      <Edit01 size={14} className="mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setDeleteKeyId(key.id);
                        setOpenDropdownId(null);
                      }}
                    >
                      <Trash01 size={14} className="mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                )}
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      {/* Rename dialog */}
      <Dialog
        open={!!renameKeyId}
        onOpenChange={(open) => {
          if (!open) {
            setRenameKeyId(null);
            setRenameName("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Gateway Key</DialogTitle>
            <DialogDescription>
              Enter a new name for this gateway key.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="Gateway Key name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameKeyId(null);
                setRenameName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameName.trim() || actions.update.isPending}
            >
              {actions.update.isPending && (
                <Loading01 size={16} className="mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteKeyId}
        onOpenChange={(open) => !open && setDeleteKeyId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Gateway Key</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The gateway key will be immediately
              revoked and any applications using it will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actions.delete.isPending ? (
                <Loading01 size={16} className="mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Main Gateway Key Section Component
 */
function GatewayKeySectionContent({
  gatewayId,
  gatewayTitle,
}: GatewayKeySectionProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">Gateway Keys</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus size={14} />
          Create Key
        </Button>
      </div>

      <GatewayKeyList gatewayId={gatewayId} />

      <CreateKeyDialog
        gatewayId={gatewayId}
        gatewayTitle={gatewayTitle}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onKeyCreated={() => {
          // Key was created, list will refresh automatically via query invalidation
        }}
      />
    </div>
  );
}

export function GatewayKeySection(props: GatewayKeySectionProps) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Gateway Keys</span>
            </div>
            <div className="flex items-center justify-center py-4">
              <Loading01
                size={16}
                className="animate-spin text-muted-foreground"
              />
            </div>
          </div>
        }
      >
        <GatewayKeySectionContent {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
