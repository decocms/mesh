/**
 * Org Shell Layout
 *
 * Shared parent for `/$org/` (home) and `/$org/$taskId` (chat). Owns the
 * sidebar + toolbar shell + ChatPrefsProvider. Per-task chrome (toggles,
 * tabs, tasks panel, Chat.Provider) lives in agent-shell-layout, which
 * sits below this one in the route tree.
 */

import { Suspense } from "react";
import {
  SidebarInset,
  SidebarLayout,
  SidebarProvider,
} from "@deco/ui/components/sidebar.tsx";
import { useIsMobile } from "@deco/ui/hooks/use-mobile.ts";
import { Loading01 } from "@untitledui/icons";
import { Outlet } from "@tanstack/react-router";
import { StudioSidebar } from "@/web/components/sidebar";
import { ChatPrefsProvider } from "@/web/components/chat/context";
import { TasksPanelStateProvider } from "@/web/hooks/use-tasks-panel-state";
import { Toolbar } from "@/web/layouts/agent-shell-layout/toolbar";

export default function OrgShellLayout() {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex flex-col h-dvh overflow-hidden">
        <SidebarLayout
          className="flex-1 bg-sidebar"
          style={
            {
              "--sidebar-width-icon": "3.5rem",
            } as Record<string, string>
          }
        >
          <StudioSidebar />
          <SidebarInset
            className="flex flex-col"
            style={{
              background: "transparent",
              containerType: "inline-size",
            }}
          >
            <ChatPrefsProvider>
              <TasksPanelStateProvider>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center">
                      <Loading01
                        size={20}
                        className="animate-spin text-muted-foreground"
                      />
                    </div>
                  }
                >
                  {isMobile ? (
                    <Outlet />
                  ) : (
                    <Toolbar>
                      <Toolbar.Header>
                        <Toolbar.LeftColumn>
                          <Toolbar.Nav />
                          <Toolbar.TogglesSlot />
                        </Toolbar.LeftColumn>
                        <Toolbar.CenterSlot />
                        <Toolbar.RightColumn>
                          <Toolbar.TabsSlot />
                          <Toolbar.RightSlot />
                        </Toolbar.RightColumn>
                      </Toolbar.Header>
                      <div className="flex-1 min-h-0 flex flex-row">
                        <Outlet />
                      </div>
                    </Toolbar>
                  )}
                </Suspense>
              </TasksPanelStateProvider>
            </ChatPrefsProvider>
          </SidebarInset>
        </SidebarLayout>
      </div>
    </SidebarProvider>
  );
}
