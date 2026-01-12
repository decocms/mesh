import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { Check, Code01, Copy01 } from "@untitledui/icons";
import { useState } from "react";
import { useDeveloperMode } from "@/web/hooks/use-developer-mode.ts";

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
  const [developerMode, setDeveloperMode] = useDeveloperMode();
  const [copied, setCopied] = useState(false);

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>Profile Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col">
          <div className="p-5 space-y-6">
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

            {/* Developer Mode */}
            <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Code01 size={16} className="text-muted-foreground" />
                  Developer Mode
                </Label>
                <p className="text-xs text-muted-foreground">
                  Show technical details like JSON input/output for tool calls
                </p>
              </div>
              <Switch
                checked={developerMode}
                onCheckedChange={setDeveloperMode}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-4 flex items-center justify-between gap-2.5 shrink-0">
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
