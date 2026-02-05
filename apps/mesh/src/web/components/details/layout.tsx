import { Page } from "@/web/components/page";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
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
  breadcrumb?: ReactNode;
}

export function ViewLayout({ children, breadcrumb }: ViewLayoutProps) {
  const [tabsEl, setTabsEl] = useState<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);

  // Track current values in refs to compare BEFORE calling setState
  // This prevents setState from being called during commit phase when value hasn't changed
  const tabsElRef = useRef<HTMLDivElement | null>(null);
  const actionsElRef = useRef<HTMLDivElement | null>(null);

  const tabsRef = useCallback((node: HTMLDivElement | null) => {
    if (tabsElRef.current !== node) {
      tabsElRef.current = node;
      setTabsEl(node);
    }
  }, []);

  const actionsRef = useCallback((node: HTMLDivElement | null) => {
    if (actionsElRef.current !== node) {
      actionsElRef.current = node;
      setActionsEl(node);
    }
  }, []);

  return (
    <ViewLayoutContext value={{ tabsEl, actionsEl }}>
      <Page>
        {/* Header */}
        <Page.Header>
          <Page.Header.Left>{breadcrumb}</Page.Header.Left>

          {/* Tabs and Actions */}
          <Page.Header.Right>
            {/* Tabs Slot */}
            <div
              ref={tabsRef}
              className="flex items-center gap-2 overflow-x-auto min-w-0"
            />

            {/* Actions Slot */}
            <div
              ref={actionsRef}
              className="flex items-center gap-2 shrink-0"
            />
          </Page.Header.Right>
        </Page.Header>

        {/* Main Content */}
        <Page.Content>{children}</Page.Content>
      </Page>
    </ViewLayoutContext>
  );
}
