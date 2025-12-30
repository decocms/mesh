import { useState, Suspense } from "react";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { SidebarItemsSection } from "@/web/components/sidebar-items-section";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { NavigationSidebar } from "@deco/ui/components/navigation-sidebar.tsx";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@deco/ui/components/sidebar.tsx";
import { Plus } from "@untitledui/icons";
import { AddBindingModal } from "@/web/components/add-binding";

export function MeshSidebar() {
  const sidebarItems = useProjectSidebarItems();
  const [isAddBindingOpen, setIsAddBindingOpen] = useState(false);

  return (
    <>
      <NavigationSidebar
        navigationItems={sidebarItems}
        additionalContent={
          <>
            <ErrorBoundary>
              <Suspense fallback={null}>
                <SidebarItemsSection />
              </Suspense>
            </ErrorBoundary>

            {/* Add Binding Button */}
            <SidebarSeparator className="my-2" />
            <SidebarMenuItem>
              <SidebarMenuButton
                className="group/nav-item cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={() => setIsAddBindingOpen(true)}
                tooltip="Add Binding"
              >
                <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
                  <Plus />
                </span>
                <span className="truncate">Add Binding</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        }
      />

      <AddBindingModal
        open={isAddBindingOpen}
        onOpenChange={setIsAddBindingOpen}
      />
    </>
  );
}
