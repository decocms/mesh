import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { CreateRoleDialog } from "@/web/components/create-role-dialog";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { InviteMemberDialog } from "@/web/components/invite-member-dialog";
import { useMembers } from "@/web/hooks/use-members";
import { useOrganizationRoles } from "@/web/hooks/use-organization-roles";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
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
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import type { TableColumn } from "@deco/ui/components/collection-table.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

function getInitials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getRoleBadgeVariant(role: string) {
  switch (role) {
    case "owner":
      return "default";
    case "admin":
      return "secondary";
    default:
      return "outline";
  }
}

interface MemberActionsDropdownProps {
  member: {
    id: string;
    role: string;
  };
  onChangeRole: (memberId: string, role: string) => void;
  onRemove: (memberId: string) => void;
  isUpdating?: boolean;
}

function MemberActionsDropdown({
  member,
  onChangeRole,
  onRemove,
  isUpdating = false,
}: MemberActionsDropdownProps) {
  const isOwner = member.role === "owner";
  const { roles } = useOrganizationRoles();

  // Filter out the current role and owner role from options
  const availableRoles = roles.filter(
    (r) => r.role !== member.role && r.role !== "owner",
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={isOwner}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="more_vert" size={20} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isUpdating}>
            <Icon name="swap_horiz" size={16} />
            Change Role
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {availableRoles.map((role) => {
              // Build description parts for custom roles
              const parts: string[] = [];

              if (!role.isBuiltin) {
                // Static permissions
                if (role.allowsAllStaticPermissions) {
                  parts.push("Full org access");
                } else if (
                  role.staticPermissionCount &&
                  role.staticPermissionCount > 0
                ) {
                  parts.push(
                    `${role.staticPermissionCount} org perm${role.staticPermissionCount !== 1 ? "s" : ""}`,
                  );
                }

                // Connection permissions
                if (role.allowsAllConnections) {
                  parts.push("All connections");
                } else if (role.connectionCount && role.connectionCount > 0) {
                  parts.push(
                    `${role.connectionCount} connection${role.connectionCount !== 1 ? "s" : ""}`,
                  );
                }

                // Tool permissions
                if (role.connectionCount !== 0 || role.allowsAllConnections) {
                  if (role.allowsAllTools) {
                    parts.push("all tools");
                  } else if (role.toolCount && role.toolCount > 0) {
                    parts.push(
                      `${role.toolCount} tool${role.toolCount !== 1 ? "s" : ""}`,
                    );
                  }
                }
              }

              return (
                <DropdownMenuItem
                  key={role.role}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeRole(member.id, role.role);
                  }}
                  disabled={isUpdating}
                >
                  <Icon name={role.isBuiltin ? "shield" : "key"} size={16} />
                  <span className="flex flex-col">
                    <span>{role.label}</span>
                    {!role.isBuiltin && parts.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {parts.join(", ")}
                      </span>
                    )}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(member.id);
          }}
        >
          <Icon name="delete" size={16} />
          Remove Member
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgMembersContent() {
  const { data } = useMembers();
  const queryClient = useQueryClient();
  const { locator } = useProjectContext();
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sortKey, setSortKey] = useState<string>("member");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    "asc",
  );

  const members = data?.data?.members;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) =>
        prev === "asc" ? "desc" : prev === "desc" ? null : "asc",
      );
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  let filtered = members ?? [];

  // Filter by search
  if (search) {
    const lowerSearch = search.toLowerCase();
    filtered = filtered.filter(
      (member) =>
        member.user?.name?.toLowerCase().includes(lowerSearch) ||
        member.user?.email?.toLowerCase().includes(lowerSearch) ||
        member.role?.toLowerCase().includes(lowerSearch),
    );
  }

  // Sort
  if (sortKey && sortDirection) {
    filtered = [...filtered].sort((a, b) => {
      let aVal: string;
      let bVal: string;

      switch (sortKey) {
        case "member":
          aVal = a.user?.name || "";
          bVal = b.user?.name || "";
          break;
        case "role":
          aVal = a.role || "";
          bVal = b.role || "";
          break;
        case "joined":
          aVal = a.createdAt
            ? typeof a.createdAt === "string"
              ? a.createdAt
              : a.createdAt.toISOString()
            : "";
          bVal = b.createdAt
            ? typeof b.createdAt === "string"
              ? b.createdAt
              : b.createdAt.toISOString()
            : "";
          break;
        default:
          return 0;
      }

      return sortDirection === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }

  const filteredAndSortedMembers = filtered;

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const result = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
      });
      if (result?.error) {
        throw new Error(result.error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.members(locator) });
      toast.success("Member has been removed from the organization");
      setMemberToRemove(null);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove member",
      );
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: string;
    }) => {
      const result = await authClient.organization.updateMemberRole({
        memberId,
        role: [role],
      });
      if (result?.error) {
        throw new Error(result.error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.members(locator) });
      toast.success("Member's role has been updated");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update role",
      );
    },
  });

  type Member = NonNullable<typeof members>[number];

  const columns: TableColumn<Member>[] = [
    {
      id: "member",
      header: "Member",
      render: (member) => (
        <div className="flex items-center gap-3">
          <Avatar
            url={member.user?.image ?? undefined}
            fallback={getInitials(member.user?.name)}
            shape="circle"
            size="sm"
          />
          <div>
            <div className="text-sm font-medium text-foreground">
              {member.user?.name || "Unknown"}
            </div>
            <div className="text-sm text-muted-foreground">
              {member.user?.email}
            </div>
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      id: "role",
      header: "Role",
      render: (member) => (
        <Badge variant={getRoleBadgeVariant(member.role)}>{member.role}</Badge>
      ),
      cellClassName: "w-[120px]",
      sortable: true,
    },
    {
      id: "joined",
      header: "Joined",
      render: (member) => (
        <span className="text-sm text-muted-foreground">
          {member.createdAt
            ? new Date(member.createdAt).toLocaleDateString()
            : "N/A"}
        </span>
      ),
      cellClassName: "w-[150px]",
      sortable: true,
    },
    {
      id: "actions",
      header: "",
      render: (member) => (
        <MemberActionsDropdown
          member={member}
          onChangeRole={(memberId, role) =>
            updateRoleMutation.mutate({ memberId, role })
          }
          onRemove={setMemberToRemove}
          isUpdating={updateRoleMutation.isPending}
        />
      ),
      cellClassName: "w-[60px]",
    },
  ];

  const ctaButton = (
    <div className="flex items-center gap-2">
      <CreateRoleDialog
        trigger={
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 rounded-lg text-sm font-medium"
          >
            <Icon name="add" size={16} />
            Create Role
          </Button>
        }
      />
      <InviteMemberDialog
        trigger={
          <Button size="sm" className="h-7 px-3 rounded-lg text-sm font-medium">
            Invite Member
          </Button>
        }
      />
    </div>
  );

  return (
    <CollectionPage>
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={() => setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member from the organization?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                memberToRemove && removeMemberMutation.mutate(memberToRemove)
              }
              disabled={removeMemberMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CollectionHeader
        title="Members"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
        sortOptions={[
          { id: "member", label: "Name" },
          { id: "role", label: "Role" },
          { id: "joined", label: "Joined" },
        ]}
        ctaButton={ctaButton}
      />

      <CollectionSearch
        value={search}
        onChange={setSearch}
        placeholder="Search members..."
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setSearch("");
            (event.target as HTMLInputElement).blur();
          }
        }}
      />

      {viewMode === "cards" ? (
        <div className="flex-1 overflow-auto p-5">
          {filteredAndSortedMembers.length === 0 ? (
            <EmptyState
              title={search ? "No members found" : "No members found"}
              description={
                search
                  ? `No members match "${search}"`
                  : "Invite members to get started."
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAndSortedMembers.map((member) => (
                <Card key={member.id} className="transition-colors relative">
                  <div className="absolute top-4 right-4 z-10">
                    <MemberActionsDropdown
                      member={member}
                      onChangeRole={(memberId, role) =>
                        updateRoleMutation.mutate({ memberId, role })
                      }
                      onRemove={setMemberToRemove}
                      isUpdating={updateRoleMutation.isPending}
                    />
                  </div>
                  <div className="flex flex-col gap-4 p-6">
                    <Avatar
                      url={member.user?.image ?? undefined}
                      fallback={getInitials(member.user?.name)}
                      shape="circle"
                      size="lg"
                      className="shrink-0"
                    />
                    <div className="flex flex-col gap-2">
                      <h3 className="text-base font-medium text-foreground truncate">
                        {member.user?.name || "Unknown"}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {member.user?.email}
                      </p>
                      <Badge
                        variant={getRoleBadgeVariant(member.role)}
                        className="w-fit"
                      >
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <CollectionTableWrapper
          columns={columns}
          data={filteredAndSortedMembers}
          isLoading={false}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          emptyState={
            search ? (
              <EmptyState
                title="No members found"
                description={`No members match "${search}"`}
              />
            ) : (
              <EmptyState
                title="No members found"
                description="Invite members to get started."
              />
            )
          }
        />
      )}
    </CollectionPage>
  );
}

export default function OrgMembers() {
  return (
    <ErrorBoundary
      fallback={
        <CollectionPage>
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">
              Failed to load members
            </div>
          </div>
        </CollectionPage>
      }
    >
      <Suspense
        fallback={
          <CollectionPage>
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CollectionPage>
        }
      >
        <OrgMembersContent />
      </Suspense>
    </ErrorBoundary>
  );
}
