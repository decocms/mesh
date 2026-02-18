import { Avatar } from "@deco/ui/components/avatar.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  Bell01,
  Check,
  CheckDone01,
  Code01,
  Copy01,
  Folder,
  X,
} from "@untitledui/icons";
import { useState } from "react";
import { usePreferences } from "@/web/hooks/use-preferences.ts";

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; name?: string | null; email: string };
  userImage?: string;
}

export function UserSettingsDialog({
  open,
  onOpenChange,
  user,
  userImage,
}: UserSettingsDialogProps) {
  const [preferences, setPreferences] = usePreferences();
  const [copied, setCopied] = useState(false);

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg sm:max-h-[85vh] p-0 flex flex-col"
        closeButtonClassName="hidden"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 relative">
          <DialogTitle className="text-base">Profile Settings</DialogTitle>
          <DialogClose className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X size={16} />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <div className="flex flex-col">
          <div className="p-5 space-y-6 min-h-[225px]">
            {/* User Info Display */}
            <div className="flex items-center gap-4">
              <Avatar
                url={userImage}
                fallback={user.name || "U"}
                shape="circle"
                size="xl"
                className="h-16 w-16"
              />
              <div className="flex flex-col gap-1">
                <span className="text-base font-medium text-foreground">
                  {user.name || "User"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </div>

            {/* Preferences */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-foreground">
                Preferences
              </h3>
              <button
                type="button"
                onClick={() =>
                  setPreferences((prev) => ({
                    ...prev,
                    devMode: !prev.devMode,
                  }))
                }
                className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left w-full cursor-pointer"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2 pointer-events-none">
                    <Code01 size={16} className="text-muted-foreground" />
                    Developer Mode
                  </Label>
                  <p className="text-xs text-muted-foreground pointer-events-none">
                    Show technical details like JSON input/output for tool calls
                  </p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={preferences.devMode}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({ ...prev, devMode: checked }))
                    }
                  />
                </div>
              </button>
              <button
                type="button"
                onClick={() =>
                  setPreferences((prev) => ({
                    ...prev,
                    enableNotifications: !prev.enableNotifications,
                  }))
                }
                className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left w-full cursor-pointer"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2 pointer-events-none">
                    <Bell01 size={16} className="text-muted-foreground" />
                    Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground pointer-events-none">
                    Play a sound and show notifications when chat messages
                    complete while app is unfocused
                  </p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={preferences.enableNotifications}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({
                        ...prev,
                        enableNotifications: checked,
                      }))
                    }
                  />
                </div>
              </button>
            </div>

            {/* Tool Approval */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-foreground">
                Tool Approval
              </Label>
              <p className="text-xs text-muted-foreground">
                Choose when to require approval before tools execute
              </p>
              <Select
                value={preferences.toolApprovalLevel}
                onValueChange={(value) =>
                  setPreferences((prev) => ({
                    ...prev,
                    toolApprovalLevel: value as "none" | "readonly" | "yolo",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <div className="flex items-start flex-col gap-0.5">
                      <span className="font-medium">None</span>
                      <span className="text-xs text-muted-foreground">
                        Require approval for all tool calls
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="readonly">
                    <div className="flex items-start flex-col gap-0.5">
                      <span className="font-medium">Read-only</span>
                      <span className="text-xs text-muted-foreground">
                        Auto-approve read-only tools
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="yolo">
                    <div className="flex items-start flex-col gap-0.5">
                      <span className="font-medium">YOLO</span>
                      <span className="text-xs text-muted-foreground">
                        Execute all tools without approval
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Experimental */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-foreground">
                Experimental
              </h3>
              <p className="text-xs text-muted-foreground">
                Experimental features are unstable and may change or stop
                working at any time.
              </p>
              <button
                type="button"
                onClick={() =>
                  setPreferences((prev) => ({
                    ...prev,
                    experimental_projects: !prev.experimental_projects,
                  }))
                }
                className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left w-full cursor-pointer"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2 pointer-events-none">
                    <Folder size={16} className="text-muted-foreground" />
                    Projects
                  </Label>
                  <p className="text-xs text-muted-foreground pointer-events-none">
                    Enable the projects feature in the sidebar
                  </p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={preferences.experimental_projects}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({
                        ...prev,
                        experimental_projects: checked,
                      }))
                    }
                  />
                </div>
              </button>
              <button
                type="button"
                onClick={() =>
                  setPreferences((prev) => ({
                    ...prev,
                    experimental_tasks: !prev.experimental_tasks,
                  }))
                }
                className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left w-full cursor-pointer"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2 pointer-events-none">
                    <CheckDone01 size={16} className="text-muted-foreground" />
                    Tasks
                  </Label>
                  <p className="text-xs text-muted-foreground pointer-events-none">
                    Enable the tasks feature in the sidebar
                  </p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={preferences.experimental_tasks}
                    onCheckedChange={(checked) =>
                      setPreferences((prev) => ({
                        ...prev,
                        experimental_tasks: checked,
                      }))
                    }
                  />
                </div>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-4 flex items-center justify-between shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCopyUserId}
                    className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="font-mono text-xs">{user.id}</span>
                    {copied ? (
                      <Check size={14} className="text-green-600" />
                    ) : (
                      <Copy01
                        size={14}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Copy user ID</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="text-xs text-muted-foreground/75">
              v{__MESH_VERSION__}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
