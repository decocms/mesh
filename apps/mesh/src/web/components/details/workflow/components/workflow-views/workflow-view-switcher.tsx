import { useActiveView } from "../../stores/panels";
import { usePanelsActions } from "../../stores/panels";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { GitBranch01 } from "@untitledui/icons";
import { CodeXml } from "lucide-react";

export function WorkflowViewSwitcher() {
  const activeView = useActiveView();
  const { setActiveView } = usePanelsActions();

  const switchView = () => {
    if (activeView === "code") {
      setActiveView("canvas");
    } else if (activeView === "canvas") {
      setActiveView("code");
    }
  };
  return (
    <div className="bg-muted border border-border rounded-lg flex">
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          activeView === "code" && "bg-transparent text-muted-foreground",
          activeView === "canvas" && "hover:text-primary hover:bg-background",
        )}
        onClick={() => switchView()}
      >
        <GitBranch01 className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          activeView === "canvas" && "bg-transparent text-muted-foreground",
          activeView === "code" && "hover:text-primary hover:bg-background",
        )}
        onClick={() => switchView()}
      >
        <CodeXml className="w-4 h-4" />
      </Button>
    </div>
  );
}
