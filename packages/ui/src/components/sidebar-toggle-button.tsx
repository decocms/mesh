import { Button } from "./button.tsx";
import { LayoutRight } from "@untitledui/icons";
import { useSidebar } from "./sidebar.tsx";

export function SidebarToggleButton() {
  const { toggleSidebar } = useSidebar();

  return (
    <>
      <Button
        onClick={toggleSidebar}
        size="icon"
        variant="ghost"
        className="w-8 h-8 rounded-md"
      >
        <LayoutRight
          className="text-muted-foreground/85 group-hover:text-foreground transition-colors"
          size={20}
        />
      </Button>
    </>
  );
}

// Skeleton for the toggle button
SidebarToggleButton.Skeleton = function SidebarToggleButtonSkeleton() {
  return <div className="w-8 h-8 bg-muted rounded-md animate-pulse" />;
};
