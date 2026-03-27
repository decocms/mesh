import { AccountPopover } from "@/web/components/account-popover";
import { cn } from "@deco/ui/lib/utils.ts";
import { Settings01 } from "@untitledui/icons";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";

export function SidebarInboxFooterMobile({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  return (
    <div className="flex flex-col items-center gap-1.5 px-1">
      <button
        type="button"
        onClick={() => {
          navigate({
            to: "/$org/settings",
            params: { org: org.slug },
          });
          onClose();
        }}
        className={cn(
          "flex size-10 items-center justify-center rounded-lg transition-colors",
          "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
        title="Settings"
      >
        <Settings01 size={20} />
      </button>
      <div className="flex items-center justify-center">
        <AccountPopover />
      </div>
    </div>
  );
}
