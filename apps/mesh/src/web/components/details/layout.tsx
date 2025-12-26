import { Button } from "@deco/ui/components/button.tsx";
import { ArrowLeft } from "@untitledui/icons";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TABS_PORTAL_ID = "view-details-tabs-portal";
const ACTIONS_PORTAL_ID = "view-details-actions-portal";

interface PortalProps {
  children: ReactNode;
}

function usePortal(id: string) {
  const [element, setElement] = useState<HTMLElement | null>(null);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    setElement(document.getElementById(id));
  }, [id]);

  return element;
}

export function ViewTabs({ children }: PortalProps) {
  const target = usePortal(TABS_PORTAL_ID);
  if (!target) return null;
  return createPortal(children, target);
}

export function ViewActions({ children }: PortalProps) {
  const target = usePortal(ACTIONS_PORTAL_ID);
  if (!target) return null;
  return createPortal(children, target);
}

interface ViewLayoutProps {
  children: ReactNode;
  onBack: () => void;
}

export function ViewLayout({ children, onBack }: ViewLayoutProps) {
  return (
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

        {/* Tabs and Actions */}
        <div className="flex justify-between px-4 items-center gap-4 flex-1">
          {/* Tabs Slot */}
          <div id={TABS_PORTAL_ID} className="flex items-center gap-2" />

          {/* Actions Slot */}
          <div
            id={ACTIONS_PORTAL_ID}
            className="flex items-center gap-2 ml-auto"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
