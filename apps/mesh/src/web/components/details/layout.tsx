import { Button } from "@deco/ui/components/button.tsx";
import { ArrowLeft } from "@untitledui/icons";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

interface ViewLayoutContextValue {
  tabsEl: HTMLDivElement | null;
  actionsEl: HTMLDivElement | null;
}

const ViewLayoutContext = createContext<ViewLayoutContextValue | null>(null);

interface PortalProps {
  children: ReactNode;
  icon?: string;
  title?: string;
}

export function ViewTabs({ children }: PortalProps) {
  const ctx = useContext(ViewLayoutContext);
  if (!ctx?.tabsEl) return null;
  return createPortal(children, ctx.tabsEl);
}

export function ViewActions({ children }: PortalProps) {
  const ctx = useContext(ViewLayoutContext);
  if (!ctx?.actionsEl) return null;
  return createPortal(children, ctx.actionsEl);
}

interface ViewLayoutProps {
  children: ReactNode;
  onBack: () => void;
  title?: string;
}

export function ViewLayout({ children, onBack, title }: ViewLayoutProps) {
  const [tabsEl, setTabsEl] = useState<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);

  return (
    <ViewLayoutContext value={{ tabsEl, actionsEl }}>
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex items-center h-12 border-b border-border shrink-0">
          {/* Back Button */}
          <div className="flex h-full px-2 border-r items-center">
            <Button
              variant="ghost"
              size="icon"
              className="items-center size-8 text-muted-foreground"
              onClick={onBack}
            >
              <ArrowLeft />
            </Button>
          </div>

          {title && (
            <div className="flex items-center gap-2 px-2">
              <p className="text-sm font-medium">{title}</p>
            </div>
          )}

          {/* Tabs and Actions */}
          <div className="flex px-4 items-center gap-0 flex-1 min-w-0">
            {/* Tabs Slot */}
            <div
              ref={setTabsEl}
              className="flex items-center gap-2 overflow-x-auto min-w-0"
            />

            {/* Actions Slot */}
            <div
              ref={setActionsEl}
              className="flex items-center gap-2 ml-auto shrink-0 border-l border-border pl-4"
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </ViewLayoutContext>
  );
}
