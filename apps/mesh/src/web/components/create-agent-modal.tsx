import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@deco/ui/components/drawer.tsx";
import { useIsMobile } from "@deco/ui/hooks/use-mobile.ts";
import { Plus } from "@untitledui/icons";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
import { GitHubRepoPicker } from "@/web/components/github-repo-picker.tsx";

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

interface CreateAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAgentModal({
  open,
  onOpenChange,
}: CreateAgentModalProps) {
  const isMobile = useIsMobile();
  const [githubPickerOpen, setGithubPickerOpen] = useState(false);
  const { createVirtualMCP, isCreating } = useCreateVirtualMCP({
    navigateOnCreate: true,
  });

  const handleBlankAgent = async () => {
    await createVirtualMCP();
    onOpenChange(false);
  };

  const handleGithubImport = () => {
    onOpenChange(false);
    setGithubPickerOpen(true);
  };

  const content = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
      <button
        type="button"
        disabled={isCreating}
        onClick={handleBlankAgent}
        className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border hover:bg-accent transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="w-12 h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center transition-transform group-hover:scale-105">
          <Plus size={20} className="text-muted-foreground" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-medium text-foreground">
            Blank agent
          </span>
          <span className="text-xs text-muted-foreground text-center">
            Start with an empty agent
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={handleGithubImport}
        className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border hover:bg-accent transition-colors cursor-pointer group"
      >
        <div className="w-12 h-12 rounded-xl border border-border flex items-center justify-center transition-transform group-hover:scale-105">
          <GitHubIcon size={20} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-medium text-foreground">
            Import from GitHub
          </span>
          <span className="text-xs text-muted-foreground text-center">
            Import a repository as an agent
          </span>
        </div>
      </button>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader className="px-4 pt-4 pb-0">
              <DrawerTitle className="text-lg font-semibold">
                Create Agent
              </DrawerTitle>
            </DrawerHeader>
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle className="text-lg font-semibold">
                Create Agent
              </DialogTitle>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      )}

      <GitHubRepoPicker
        open={githubPickerOpen}
        onOpenChange={setGithubPickerOpen}
      />
    </>
  );
}
