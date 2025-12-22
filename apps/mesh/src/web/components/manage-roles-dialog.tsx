import {
  getPermissionOptions,
  getToolsByCategory,
  type ToolName,
} from "@/tools/registry";
import { ToolSetSelector } from "@/web/components/tool-set-selector.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useMembers } from "@/web/hooks/use-members";
import {
  useOrganizationRoles,
  type OrganizationRole,
} from "@/web/hooks/use-organization-roles";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Checkbox } from "@deco/ui/components/checkbox.tsx";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@deco/ui/components/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { CollectionSearch } from "./collections/collection-search.tsx";

interface ManageRolesDialogProps {
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

type RoleFormData = {
  roleName: string;
  roleColor: string;
  // Static permissions (organization-level)
  allowAllStaticPermissions: boolean;
  staticPermissions: ToolName[];
  // Connection-specific permissions (MCP permissions)
  toolSet: Record<string, string[]>; // connectionId -> toolNames[]
  // Members
  memberIds: string[];
};

// Helper to get initials from name
function getInitials(name: string | undefined | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Built-in roles that cannot be edited
const BUILTIN_ROLES = [
  { role: "owner", label: "Owner", color: "bg-red-500" },
  { role: "admin", label: "Admin", color: "bg-blue-500" },
  { role: "user", label: "User", color: "bg-green-500" },
] as const;

// Available colors for custom roles
const ROLE_COLORS = [
  "bg-neutral-400",
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-rose-500",
  "bg-slate-500",
] as const;

// MCP Permissions Tab is now handled by ToolSetSelector component

// ============================================================================
// Organization Permissions Tab
// ============================================================================

interface OrgPermissionsTabProps {
  allowAllStaticPermissions: boolean;
  staticPermissions: ToolName[];
  onAllowAllChange: (allowAll: boolean) => void;
  onPermissionsChange: (permissions: ToolName[]) => void;
}

function OrgPermissionsTab({
  allowAllStaticPermissions,
  staticPermissions,
  onAllowAllChange,
  onPermissionsChange,
}: OrgPermissionsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const toolsByCategory = getToolsByCategory();
  const allPermissions = getPermissionOptions();

  // Filter permissions by search
  const filteredPermissions = allPermissions.filter((perm) =>
    perm.label.toLowerCase().includes(deferredSearchQuery.toLowerCase()),
  );

  // Toggle a single permission
  const togglePermission = (permission: ToolName) => {
    if (staticPermissions.includes(permission)) {
      onPermissionsChange(staticPermissions.filter((p) => p !== permission));
    } else {
      const newPermissions = [...staticPermissions, permission];
      // If all permissions are now selected, turn on allowAll
      if (newPermissions.length === allPermissions.length) {
        onAllowAllChange(true);
        onPermissionsChange([]);
      } else {
        onPermissionsChange(newPermissions);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="border-b border-border">
        <CollectionSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search permissions..."
          className="border-b-0"
        />
      </div>

      {/* Select All Toggle */}
      <div className="border-b border-border">
        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-muted/50 cursor-pointer"
          onClick={() => {
            const newValue = !allowAllStaticPermissions;
            onAllowAllChange(newValue);
            onPermissionsChange([]);
          }}
        >
          <span className="text-sm font-medium">
            All organization permissions
          </span>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={allowAllStaticPermissions}
              onCheckedChange={(checked) => {
                onAllowAllChange(checked);
                onPermissionsChange([]);
              }}
            />
          </div>
        </div>
      </div>

      {/* Permissions List */}
      <div className="flex-1 overflow-auto">
        {Object.entries(toolsByCategory).map(([category, tools]) => {
          const categoryPermissions = filteredPermissions.filter((p) =>
            tools.some((t) => t.name === p.value),
          );

          if (categoryPermissions.length === 0) return null;

          return (
            <div key={category} className="mb-6 last:mb-0">
              <h4 className="text-sm font-medium p-3 pb-1.5 text-muted-foreground/75">
                {category}
              </h4>
              <div className="space-y-1">
                {categoryPermissions.map((permission) => (
                  <div
                    key={permission.value}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      if (allowAllStaticPermissions) {
                        onAllowAllChange(false);
                        // Select all except this one
                        const allPerms = allPermissions.map((p) => p.value);
                        onPermissionsChange(
                          allPerms.filter((p) => p !== permission.value),
                        );
                      } else {
                        togglePermission(permission.value);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{permission.label}</span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={
                          allowAllStaticPermissions ||
                          staticPermissions.includes(permission.value)
                        }
                        onCheckedChange={() => {
                          if (allowAllStaticPermissions) {
                            onAllowAllChange(false);
                            // Select all except this one
                            const allPerms = allPermissions.map((p) => p.value);
                            onPermissionsChange(
                              allPerms.filter((p) => p !== permission.value),
                            );
                          } else {
                            togglePermission(permission.value);
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Add Member Dialog
// ============================================================================

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedMemberIds: string[];
  onAddMembers: (memberIds: string[]) => void;
}

function AddMemberDialog({
  open,
  onOpenChange,
  selectedMemberIds,
  onAddMembers,
}: AddMemberDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [pendingMemberIds, setPendingMemberIds] = useState<string[]>([]);

  const { data } = useMembers();
  const members = data?.data?.members ?? [];

  // Filter members by search
  const filteredMembers = members.filter((member) => {
    const searchLower = deferredSearchQuery.toLowerCase();
    return (
      member.user?.name?.toLowerCase().includes(searchLower) ||
      member.user?.email?.toLowerCase().includes(searchLower)
    );
  });

  // Check if member is eligible (not owner)
  const isMemberEligible = (member: (typeof members)[number]) => {
    return member.role !== "owner";
  };

  // Check if member is already in the role
  const isAlreadyInRole = (memberId: string) => {
    return selectedMemberIds.includes(memberId);
  };

  // Toggle member selection
  const toggleMember = (memberId: string) => {
    if (pendingMemberIds.includes(memberId)) {
      setPendingMemberIds(pendingMemberIds.filter((id) => id !== memberId));
    } else {
      setPendingMemberIds([...pendingMemberIds, memberId]);
    }
  };

  const handleAdd = () => {
    onAddMembers(pendingMemberIds);
    setPendingMemberIds([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Add Members to Role</DialogTitle>
          <DialogDescription>
            Select members to add to this role.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col h-80">
          <CollectionSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search members..."
            className="border-b border-t-0 border-x-0 rounded-none"
          />

          <div className="flex-1 overflow-auto">
            {filteredMembers.length === 0 ? (
              <div className="flex items-center justify-center h-full px-6">
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "No members found" : "No members available"}
                </p>
              </div>
            ) : (
              <div className="px-6 py-2 space-y-1">
                {filteredMembers.map((member) => {
                  const eligible = isMemberEligible(member);
                  const alreadyInRole = isAlreadyInRole(member.id);
                  const isSelected = pendingMemberIds.includes(member.id);

                  return (
                    <label
                      key={member.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg",
                        !eligible || alreadyInRole
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer hover:bg-muted/50",
                      )}
                    >
                      <Checkbox
                        checked={isSelected || alreadyInRole}
                        onCheckedChange={() => {
                          if (eligible && !alreadyInRole) {
                            toggleMember(member.id);
                          }
                        }}
                        disabled={!eligible || alreadyInRole}
                      />
                      <Avatar
                        url={member.user?.image ?? undefined}
                        fallback={getInitials(member.user?.name)}
                        shape="circle"
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.user?.name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.user?.email}
                        </p>
                      </div>
                      {!eligible && (
                        <Badge variant="secondary" className="shrink-0">
                          Owner
                        </Badge>
                      )}
                      {alreadyInRole && eligible && (
                        <Badge variant="outline" className="shrink-0">
                          Added
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={pendingMemberIds.length === 0}>
            Add {pendingMemberIds.length > 0 && `(${pendingMemberIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Members Tab
// ============================================================================

interface MembersTabProps {
  memberIds: string[];
  onMemberIdsChange: (memberIds: string[]) => void;
}

function MembersTabContent({ memberIds, onMemberIdsChange }: MembersTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);

  const { data } = useMembers();
  const members = data?.data?.members ?? [];

  // Get members that are in this role
  const roleMembers = members.filter((m) => memberIds.includes(m.id));

  // Filter by search
  const filteredMembers = roleMembers.filter((member) => {
    const searchLower = deferredSearchQuery.toLowerCase();
    return (
      member.user?.name?.toLowerCase().includes(searchLower) ||
      member.user?.email?.toLowerCase().includes(searchLower)
    );
  });

  // Remove member from role
  const removeMember = (memberId: string) => {
    onMemberIdsChange(memberIds.filter((id) => id !== memberId));
  };

  // Add members to role
  const handleAddMembers = (newMemberIds: string[]) => {
    onMemberIdsChange([...memberIds, ...newMemberIds]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search and Add Button */}
      <div className="flex items-center border-b border-border">
        <CollectionSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search members..."
          className="flex-1 border-b-0"
        />
        <div className="pr-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddMemberDialogOpen(true)}
          >
            <Icon name="add" size={16} />
            Add Member
          </Button>
        </div>
      </div>

      {/* Members List */}
      <div className="flex-1 overflow-auto">
        {roleMembers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">No members</h3>
              <p className="text-sm text-muted-foreground">
                Add members to this role to grant them the configured
                permissions.
              </p>
            </div>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              No members match "{searchQuery}"
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
              >
                <Avatar
                  url={member.user?.image ?? undefined}
                  fallback={getInitials(member.user?.name)}
                  shape="circle"
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.user?.name || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {member.user?.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMember(member.id)}
                >
                  <Icon name="close" size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddMemberDialog
        open={addMemberDialogOpen}
        onOpenChange={setAddMemberDialogOpen}
        selectedMemberIds={memberIds}
        onAddMembers={handleAddMembers}
      />
    </div>
  );
}

function MembersTab(props: MembersTabProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <Icon
            name="progress_activity"
            size={24}
            className="animate-spin text-muted-foreground"
          />
        </div>
      }
    >
      <MembersTabContent {...props} />
    </Suspense>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ManageRolesDialog({
  trigger,
  onSuccess,
}: ManageRolesDialogProps) {
  const [open, setOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<OrganizationRole | null>(null);
  const [activeTab, setActiveTab] = useState<"mcp" | "org" | "members">("mcp");
  const { locator } = useProjectContext();
  const queryClient = useQueryClient();

  // Get all connections for selection
  const connections = useConnections() ?? [];

  // Get existing custom roles
  const { customRoles, refetch: refetchRoles } = useOrganizationRoles();

  // Get members (using regular useQuery since we're not using Suspense here)
  const { data: membersData } = useQuery({
    queryKey: KEYS.members(locator),
    queryFn: () => authClient.organization.listMembers(),
  });

  // Form state
  const [formData, setFormData] = useState<RoleFormData>({
    roleName: "",
    roleColor: ROLE_COLORS[0],
    allowAllStaticPermissions: false,
    staticPermissions: [],
    toolSet: {},
    memberIds: [],
  });

  // Track initial state for unsaved changes detection
  const [initialFormData, setInitialFormData] =
    useState<RoleFormData>(formData);

  // Check if there are unsaved changes
  const hasUnsavedChanges =
    JSON.stringify(formData) !== JSON.stringify(initialFormData);

  // Popover and hover state for all roles (lifted out of map to follow Rules of Hooks)
  const [colorPickerOpenRoleId, setColorPickerOpenRoleId] = useState<
    string | null
  >(null);
  const [hoveredRoleId, setHoveredRoleId] = useState<string | null>(null);
  const [newRoleColorPickerOpen, setNewRoleColorPickerOpen] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);

  // Load role data into form when editing
  const loadRoleForEditing = (role: OrganizationRole) => {
    setEditingRole(role);

    const permission = role.permission || {};

    // Check for static permissions under "self"
    const selfPerms = permission["self"] || [];
    const hasAllStaticPerms = selfPerms.includes("*");
    const staticPerms = hasAllStaticPerms
      ? []
      : (selfPerms.filter((p) => p !== "*") as ToolName[]);

    // Build toolSet from connection permissions
    const toolSet: Record<string, string[]> = {};
    for (const [key, tools] of Object.entries(permission)) {
      if (key === "self") continue;
      if (key === "*") {
        // All connections - expand to all current connections
        for (const conn of connections) {
          if (tools.includes("*")) {
            toolSet[conn.id] = conn.tools?.map((t) => t.name) ?? [];
          } else {
            toolSet[conn.id] = tools;
          }
        }
      } else {
        // Specific connection
        const conn = connections.find((c) => c.id === key);
        if (conn) {
          if (tools.includes("*")) {
            toolSet[key] = conn.tools?.map((t) => t.name) ?? [];
          } else {
            toolSet[key] = tools;
          }
        }
      }
    }

    // Get color for this role based on its position in the list
    const roleIndex = customRoles.findIndex((r) => r.id === role.id);
    const roleColor =
      ROLE_COLORS[roleIndex >= 0 ? roleIndex % ROLE_COLORS.length : 0] ??
      ROLE_COLORS[0];

    // Get members with this role
    const members = membersData?.data?.members ?? [];
    const roleMemberIds = members
      .filter((m) => m.role === role.role)
      .map((m) => m.id);

    const newFormData = {
      roleName: role.label,
      roleColor,
      allowAllStaticPermissions: hasAllStaticPerms,
      staticPermissions: staticPerms,
      toolSet,
      memberIds: roleMemberIds,
    };
    setFormData(newFormData);
    setInitialFormData(newFormData);
  };

  // Handle dialog open/close
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && hasUnsavedChanges) {
      if (
        !confirm(
          "You have unsaved changes. Are you sure you want to discard them?",
        )
      ) {
        return;
      }
    }
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
    } else {
      // When opening, load the first custom role if one exists
      const firstRole = customRoles[0];
      if (firstRole && !editingRole) {
        loadRoleForEditing(firstRole);
      }
    }
  };

  // Build permission object from form data
  const buildPermission = (): Record<string, string[]> => {
    const permission: Record<string, string[]> = {};

    // Add static/organization-level permissions under "self"
    if (formData.allowAllStaticPermissions) {
      permission["self"] = ["*"];
    } else if (formData.staticPermissions.length > 0) {
      permission["self"] = formData.staticPermissions;
    }

    // Add connection/tool permissions
    for (const [connectionId, tools] of Object.entries(formData.toolSet)) {
      if (tools.length > 0) {
        const conn = connections.find((c) => c.id === connectionId);
        const allTools = conn?.tools?.map((t) => t.name) ?? [];
        // If all tools selected, use wildcard
        if (allTools.length > 0 && allTools.every((t) => tools.includes(t))) {
          permission[connectionId] = ["*"];
        } else {
          permission[connectionId] = tools;
        }
      }
    }

    return permission;
  };

  const createRoleMutation = useMutation({
    mutationFn: async () => {
      const permission = buildPermission();
      const roleSlug = formData.roleName.toLowerCase().replace(/\s+/g, "-");

      const result = await authClient.organization.createRole({
        role: roleSlug,
        permission,
      });

      if (result?.error) {
        throw new Error(result.error.message);
      }

      // Assign members to the new role
      if (formData.memberIds.length > 0) {
        const memberResults = await Promise.allSettled(
          formData.memberIds.map((memberId) =>
            authClient.organization.updateMemberRole({
              memberId,
              role: [roleSlug],
            }),
          ),
        );

        // Check for errors
        const errors = memberResults.filter((r) => r.status === "rejected");
        if (errors.length > 0) {
          console.error("Some member assignments failed:", errors);
        }
      }

      return result?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.members(locator) });
      queryClient.invalidateQueries({
        queryKey: KEYS.organizationRoles(locator),
      });
      toast.success("Role created successfully!");
      resetForm();
      setOpen(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to create role",
      );
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const permission = buildPermission();

      const result = await authClient.organization.updateRole({
        roleId,
        data: {
          permission,
        },
      });

      if (result?.error) {
        throw new Error(result.error.message);
      }

      // Update member assignments if changed
      if (editingRole?.role) {
        const roleSlug = editingRole.role;
        const members = membersData?.data?.members ?? [];
        const currentMemberIds = members
          .filter((m) => m.role === roleSlug)
          .map((m) => m.id);

        // Find members to add
        const membersToAdd = formData.memberIds.filter(
          (id) => !currentMemberIds.includes(id),
        );

        // Find members to remove (change to default "user" role)
        const membersToRemove = currentMemberIds.filter(
          (id) => !formData.memberIds.includes(id),
        );

        // Add new members to this role
        if (membersToAdd.length > 0) {
          await Promise.allSettled(
            membersToAdd.map((memberId) =>
              authClient.organization.updateMemberRole({
                memberId,
                role: [roleSlug],
              }),
            ),
          );
        }

        // Remove members from this role (set to default "user" role)
        if (membersToRemove.length > 0) {
          await Promise.allSettled(
            membersToRemove.map((memberId) =>
              authClient.organization.updateMemberRole({
                memberId,
                role: ["user"],
              }),
            ),
          );
        }
      }

      return result?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.members(locator) });
      queryClient.invalidateQueries({
        queryKey: KEYS.organizationRoles(locator),
      });
      toast.success("Role updated successfully!");
      resetForm();
      setOpen(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update role",
      );
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const result = await authClient.organization.deleteRole({ roleId });

      if (result?.error) {
        throw new Error(result.error.message);
      }

      return result?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.members(locator) });
      queryClient.invalidateQueries({
        queryKey: KEYS.organizationRoles(locator),
      });
      toast.success("Role deleted successfully!");
      resetForm();
      refetchRoles();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete role",
      );
    },
  });

  const resetForm = () => {
    setEditingRole(null);
    setActiveTab("mcp");
    const newFormData = {
      roleName: "",
      roleColor: ROLE_COLORS[0],
      allowAllStaticPermissions: false,
      staticPermissions: [],
      toolSet: {},
      memberIds: [],
    };
    setFormData(newFormData);
    setInitialFormData(newFormData);
  };

  const isPending =
    createRoleMutation.isPending ||
    updateRoleMutation.isPending ||
    deleteRoleMutation.isPending;

  const handleSubmit = () => {
    if (!formData.roleName.trim()) {
      toast.error("Please enter a role name");
      return;
    }

    // Validate static permissions
    if (
      !formData.allowAllStaticPermissions &&
      formData.staticPermissions.length === 0 &&
      Object.keys(formData.toolSet).length === 0
    ) {
      toast.error("Please select at least one permission");
      return;
    }

    if (editingRole?.id) {
      updateRoleMutation.mutate(editingRole.id);
    } else {
      createRoleMutation.mutate();
    }
  };

  // Check if form is valid
  const hasStaticPerms =
    formData.allowAllStaticPermissions || formData.staticPermissions.length > 0;
  const hasMcpPerms = Object.keys(formData.toolSet).length > 0;
  const isFormValid =
    formData.roleName.trim().length > 0 && (hasStaticPerms || hasMcpPerms);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-5xl h-[80vh] max-h-[80vh] flex flex-col p-0 overflow-hidden w-[95vw]">
        <div className="flex-1 flex overflow-hidden min-h-0 flex-col sm:flex-row">
          {/* Left Sidebar - Roles List */}
          <div className="w-full sm:w-64 sm:border-r border-b sm:border-b-0 border-border flex flex-col bg-background sm:h-full max-h-[40vh] sm:max-h-full">
            {/* Roles List */}
            <div className="flex-1 overflow-auto px-3.5 py-3.5 pt-3.5">
              <div className="flex flex-col gap-1">
                {/* Built-in Roles (Read-only) */}
                {BUILTIN_ROLES.map((builtinRole) => (
                  <div
                    key={builtinRole.role}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg overflow-hidden opacity-50 cursor-not-allowed"
                  >
                    <div
                      className={cn(
                        "shrink-0 size-3 rounded-full",
                        builtinRole.color,
                      )}
                    />
                    <p className="text-sm font-medium truncate flex-1">
                      {builtinRole.label}
                    </p>
                    <Icon
                      name="lock"
                      size={14}
                      className="text-muted-foreground shrink-0"
                    />
                  </div>
                ))}

                {/* Custom Roles */}
                {customRoles.map((role, index) => {
                  const isSelected = editingRole?.id === role.id;
                  const roleId = role.id || role.role;
                  const colorClass = ROLE_COLORS[index % ROLE_COLORS.length];
                  const isHovered = hoveredRoleId === roleId;
                  const colorPickerOpen = colorPickerOpenRoleId === roleId;

                  return (
                    <div
                      key={roleId}
                      className={cn(
                        "group flex items-center gap-2 px-2 py-1.5 rounded-lg overflow-hidden transition-colors",
                        isSelected ? "bg-accent" : "hover:bg-muted/50",
                      )}
                      onMouseEnter={() => setHoveredRoleId(roleId)}
                      onMouseLeave={() => setHoveredRoleId(null)}
                      onClick={() => {
                        if (!isSelected) {
                          loadRoleForEditing(role);
                        }
                      }}
                    >
                      <Popover
                        open={colorPickerOpen}
                        onOpenChange={(open) =>
                          setColorPickerOpenRoleId(open ? roleId : null)
                        }
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "shrink-0 size-3 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-muted-foreground transition-all",
                              isSelected ? formData.roleColor : colorClass,
                            )}
                            onClick={(e) => e.stopPropagation()}
                            title="Choose color"
                          />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="grid grid-cols-6 gap-2">
                            {ROLE_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFormData((prev) => ({
                                    ...prev,
                                    roleColor: color,
                                  }));
                                  setColorPickerOpenRoleId(null);
                                }}
                                className={cn(
                                  "size-3 rounded-full transition-all hover:scale-110",
                                  color,
                                  formData.roleColor === color &&
                                    "ring-2 ring-offset-2 ring-foreground",
                                )}
                                title={color}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {isSelected ? (
                        <Input
                          value={formData.roleName}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              roleName: e.target.value,
                            }))
                          }
                          className="flex-1 text-sm font-medium border-0 shadow-none h-auto px-0 py-0 focus-visible:ring-0 bg-transparent"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <p className="text-sm font-medium truncate flex-1">
                          {role.label}
                        </p>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "size-5 shrink-0 transition-opacity",
                              isHovered || isSelected
                                ? "opacity-100"
                                : "opacity-0 pointer-events-none",
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Icon name="more_horiz" size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (role.id) {
                                setRoleToDelete({
                                  id: role.id,
                                  label: role.label,
                                });
                                setDeleteDialogOpen(true);
                              }
                            }}
                          >
                            <Icon name="delete" size={16} />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}

                {/* Show "new role" item when creating */}
                {!editingRole && (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg overflow-hidden bg-accent">
                    <Popover
                      open={newRoleColorPickerOpen}
                      onOpenChange={setNewRoleColorPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "shrink-0 size-3 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-muted-foreground transition-all",
                            formData.roleColor,
                          )}
                          title="Choose color"
                        />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="start">
                        <div className="grid grid-cols-6 gap-2">
                          {ROLE_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  roleColor: color,
                                }));
                                setNewRoleColorPickerOpen(false);
                              }}
                              className={cn(
                                "size-3 rounded-full transition-all hover:scale-110",
                                color,
                                formData.roleColor === color &&
                                  "ring-2 ring-offset-2 ring-foreground",
                              )}
                              title={color}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Input
                      value={formData.roleName}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          roleName: e.target.value,
                        }))
                      }
                      placeholder="new role"
                      className="flex-1 text-sm font-medium border-0 shadow-none h-auto px-0 py-0 focus-visible:ring-0 bg-transparent"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Create New Role Button */}
            <div className="px-3.5 pb-3.5">
              <Button
                variant="outline"
                size="default"
                onClick={() => {
                  resetForm();
                  // Auto-focus would go here if needed
                }}
                className="w-full h-10"
              >
                <Icon name="add" size={16} />
                Create new role
              </Button>
            </div>
          </div>

          {/* Right Side - Role Editor */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tab Buttons */}
            <div className="h-12 border-b border-border px-4 py-3.5 flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("mcp")}
                className={cn(
                  "h-8 rounded-lg px-2 py-1",
                  activeTab === "mcp"
                    ? "bg-muted border-input text-foreground"
                    : "border-input text-muted-foreground bg-transparent",
                )}
              >
                MCP Permissions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("org")}
                className={cn(
                  "h-8 rounded-lg px-2 py-1",
                  activeTab === "org"
                    ? "bg-muted border-input text-foreground"
                    : "border-input text-muted-foreground bg-transparent",
                )}
              >
                Organization Permissions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("members")}
                className={cn(
                  "h-8 rounded-lg px-2 py-1",
                  activeTab === "members"
                    ? "bg-muted border-input text-foreground"
                    : "border-input text-muted-foreground bg-transparent",
                )}
              >
                Members
              </Button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden min-h-0">
              {activeTab === "mcp" && (
                <ToolSetSelector
                  toolSet={formData.toolSet}
                  onToolSetChange={(toolSet) =>
                    setFormData((prev) => ({ ...prev, toolSet }))
                  }
                />
              )}
              {activeTab === "org" && (
                <OrgPermissionsTab
                  allowAllStaticPermissions={formData.allowAllStaticPermissions}
                  staticPermissions={formData.staticPermissions}
                  onAllowAllChange={(allowAll) =>
                    setFormData((prev) => ({
                      ...prev,
                      allowAllStaticPermissions: allowAll,
                    }))
                  }
                  onPermissionsChange={(permissions) =>
                    setFormData((prev) => ({
                      ...prev,
                      staticPermissions: permissions,
                    }))
                  }
                />
              )}
              {activeTab === "members" && (
                <MembersTab
                  memberIds={formData.memberIds}
                  onMemberIdsChange={(memberIds) =>
                    setFormData((prev) => ({ ...prev, memberIds }))
                  }
                />
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-5 py-5 flex items-center justify-end gap-2.5 shrink-0">
              <Button
                variant="outline"
                onClick={() => {
                  handleOpenChange(false);
                }}
                disabled={isPending}
                className="h-10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  isPending ||
                  !isFormValid ||
                  (editingRole ? !hasUnsavedChanges : false)
                }
                className="h-10"
              >
                {editingRole
                  ? updateRoleMutation.isPending
                    ? "Saving..."
                    : "Save changes"
                  : createRoleMutation.isPending
                    ? "Creating..."
                    : "Create Role"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{roleToDelete?.label}" role?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (roleToDelete?.id) {
                  deleteRoleMutation.mutate(roleToDelete.id);
                }
                setDeleteDialogOpen(false);
                setRoleToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
