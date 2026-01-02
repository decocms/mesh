/**
 * Organization Gateway Keys Page
 *
 * Manage gateway keys for the organization.
 */

import { Suspense, useState } from "react";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary.tsx";
import { SettingsSidebar } from "@/web/components/settings/settings-sidebar.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  useGatewayKeys,
  useGatewayKeyActions,
  getGatewayIdsFromPermissions,
  type GatewayKeyWithValue,
  type GatewayKeyEntity,
} from "@/web/hooks/use-gateway-keys";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useMembers } from "@/web/hooks/use-members";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { type TableColumn } from "@deco/ui/components/collection-table.tsx";
import {
  Dialog,
  DialogContent,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import {
  Key01,
  Plus,
  Trash01,
  Loading01,
  CpuChip02,
  DotsVertical,
  Edit01,
  Copy01,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
} from "@untitledui/icons";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { toast } from "sonner";
import { Link, useParams } from "@tanstack/react-router";

/**
 * Gateway selector for gateway key creation
 */
function GatewaySelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const gateways = useGateways();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a gateway (optional)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No gateway (org access only)</SelectItem>
        {gateways.map((gateway) => (
          <SelectItem key={gateway.id} value={gateway.id}>
            {gateway.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Dialog to create a new gateway key
 */
function CreateKeyDialog({
  open,
  onOpenChange,
  onKeyCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyCreated: (key: GatewayKeyWithValue) => void;
}) {
  const [name, setName] = useState("");
  const [selectedGateway, setSelectedGateway] = useState<string>("none");
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
      setName("");
      setSelectedGateway("none");
      setCopied(false);
      setShowKey(false);
    }
    onOpenChange(isOpen);
  };

  const handleCreate = async () => {
    const permissions: Record<string, string[]> = {};

    // If a gateway is selected, add gateway permission
    if (selectedGateway && selectedGateway !== "none") {
      permissions[`gw_${selectedGateway}`] = ["*"];
    } else {
      // Default permissions (read-only org access)
      permissions["self"] = ["ORGANIZATION_LIST", "ORGANIZATION_GET"];
    }

    const result = await actions.create.mutateAsync({
      name,
      permissions,
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

  const handleDone = () => {
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
              placeholder="My Gateway Key"
              disabled={!!createdKey}
            />
          </div>
          {!createdKey && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Gateway Access</label>
              <Suspense
                fallback={
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Loading gateways..." />
                    </SelectTrigger>
                  </Select>
                }
              >
                <GatewaySelect
                  value={selectedGateway}
                  onValueChange={setSelectedGateway}
                />
              </Suspense>
              <p className="text-xs text-muted-foreground">
                {selectedGateway && selectedGateway !== "none"
                  ? "This key will have full access to the selected gateway."
                  : "This key will only have read-only access to the organization."}
              </p>
            </div>
          )}
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
 * Gateway display component - shows icon and name (no badge)
 */
function GatewayDisplay({ gatewayId }: { gatewayId: string }) {
  const gateways = useGateways();
  const gateway = gateways.find((g) => g.id === gatewayId);
  const { org } = useParams({ strict: false });

  if (!gateway) {
    return (
      <div className="flex items-center gap-2">
        <IntegrationIcon
          icon={null}
          name="Unknown Gateway"
          size="xs"
          fallbackIcon={<CpuChip02 size={12} />}
        />
        <span className="text-sm text-foreground truncate">
          Unknown Gateway
        </span>
      </div>
    );
  }

  return (
    <Link
      to="/$org/gateways/$gatewayId"
      params={{ org: org!, gatewayId: gateway.id }}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <IntegrationIcon
        icon={gateway.icon}
        name={gateway.title}
        size="xs"
        fallbackIcon={<CpuChip02 size={12} />}
      />
      <span className="text-sm text-foreground truncate">{gateway.title}</span>
    </Link>
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
 * Get user name from userId
 */
function getUserName(
  userId: string,
  members: Array<{
    userId: string;
    user: { id: string; name?: string; email: string; image?: string };
  }>,
): string {
  const member = members.find((m) => m.userId === userId);
  return member?.user?.name || member?.user?.email || "Unknown";
}

/**
 * Get user initials for avatar
 */
function getInitials(name?: string, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email && email.length > 0) {
    return email[0]!.toUpperCase();
  }
  return "?";
}

/**
 * Gateway Keys table
 */
function GatewayKeysTable({
  onRename,
  onDelete,
}: {
  onRename: (key: GatewayKeyEntity) => void;
  onDelete: (keyId: string) => void;
}) {
  const { gatewayKeys } = useGatewayKeys();
  const { data: membersData } = useMembers();
  const members = membersData?.data?.members ?? [];
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  if (!membersData) {
    return null;
  }

  const columns: TableColumn<GatewayKeyEntity>[] = [
    {
      id: "name",
      header: "Name",
      render: (key) => (
        <div className="flex items-center gap-2">
          <Key01 size={16} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">
            {key.name}
          </span>
        </div>
      ),
      cellClassName: "flex-1 min-w-0",
      sortable: true,
    },
    {
      id: "createdBy",
      header: "Created By",
      render: (key) => {
        const member = members.find((m) => m.userId === key.userId);
        const userName = getUserName(key.userId, members);
        return (
          <div className="flex items-center gap-2">
            <Avatar
              url={member?.user?.image}
              fallback={getInitials(member?.user?.name, member?.user?.email)}
              shape="circle"
              size="xs"
            />
            <span className="text-sm text-foreground truncate">{userName}</span>
          </div>
        );
      },
      cellClassName: "w-40 min-w-0 shrink-0",
    },
    {
      id: "createdAt",
      header: "Created",
      render: (key) => (
        <span className="text-sm text-muted-foreground">
          {formatShortDate(new Date(key.createdAt))}
        </span>
      ),
      cellClassName: "w-24 shrink-0",
      sortable: true,
    },
    {
      id: "gateway",
      header: "Gateway",
      render: (key) => {
        const gatewayIds = getGatewayIdsFromPermissions(key.permissions);
        if (gatewayIds.length === 0) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        // Show first gateway (most common case)
        const firstGatewayId = gatewayIds[0];
        return (
          <Suspense
            fallback={
              <div className="flex items-center gap-2">
                <Loading01
                  size={12}
                  className="animate-spin text-muted-foreground shrink-0"
                />
                <span className="text-sm text-muted-foreground">
                  Loading...
                </span>
              </div>
            }
          >
            <GatewayDisplay gatewayId={firstGatewayId!} />
          </Suspense>
        );
      },
      cellClassName: "w-48 min-w-0 shrink-0",
    },
    {
      id: "actions",
      header: "",
      render: (key) => (
        <div className="flex items-center justify-end">
          <DropdownMenu
            open={openDropdownId === key.id}
            onOpenChange={(open) => setOpenDropdownId(open ? key.id : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <DotsVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            {openDropdownId === key.id && (
              <DropdownMenuContent
                align="end"
                sideOffset={4}
                onCloseAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => {
                  e.preventDefault();
                  setOpenDropdownId(null);
                }}
              >
                <DropdownMenuItem onClick={() => onRename(key)}>
                  <Edit01 size={14} className="mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    onDelete(key.id);
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
      ),
      cellClassName: "w-12 shrink-0",
    },
  ];

  return (
    <div className="border-t border-border">
      <CollectionTableWrapper
        columns={columns}
        data={gatewayKeys}
        isLoading={false}
        emptyState={
          <EmptyState
            image={<Key01 size={48} className="text-muted-foreground/50" />}
            title="No gateway keys yet"
            description="Create a gateway key to access gateways and resources programmatically."
          />
        }
      />
    </div>
  );
}

function GatewayKeysContent() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameKeyId, setRenameKeyId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const actions = useGatewayKeyActions();

  const handleRename = (key: GatewayKeyEntity) => {
    setRenameKeyId(key.id);
    setRenameName(key.name);
  };

  const handleSaveRename = async () => {
    if (renameKeyId && renameName.trim()) {
      await actions.update.mutateAsync({
        keyId: renameKeyId,
        name: renameName.trim(),
      });
      setRenameKeyId(null);
      setRenameName("");
    }
  };

  const handleDelete = async () => {
    if (deleteKeyId) {
      await actions.delete.mutateAsync(deleteKeyId);
      setDeleteKeyId(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex h-full">
        {/* Sidebar */}
        <SettingsSidebar activeSection="gateway-keys" />

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-5">
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Gateway Keys
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Manage gateway keys for programmatic access to your gateways
                    and organization resources.
                  </p>
                </div>
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  size="sm"
                  className="h-7 px-3 rounded-lg text-sm font-medium gap-1.5"
                >
                  <Plus size={16} />
                  Create Key
                </Button>
              </div>
            </div>
          </div>

          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <Loading01
                    size={24}
                    className="animate-spin text-muted-foreground"
                  />
                </div>
              }
            >
              <GatewayKeysTable
                onRename={handleRename}
                onDelete={setDeleteKeyId}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      <CreateKeyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onKeyCreated={() => {
          // Key was created, list will refresh automatically via query invalidation
        }}
      />

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
                    handleSaveRename();
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
              onClick={handleSaveRename}
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
    </div>
  );
}

export default function GatewayKeysPage() {
  return (
    <CollectionPage>
      <CollectionHeader title="Settings" />
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex items-center justify-center flex-1">
              <Loading01
                size={24}
                className="animate-spin text-muted-foreground"
              />
            </div>
          }
        >
          <GatewayKeysContent />
        </Suspense>
      </ErrorBoundary>
    </CollectionPage>
  );
}
