/**
 * Topbar Portal
 *
 * A React portal-based system for rendering content into the project topbar
 * from anywhere in the component tree (including plugin routes).
 *
 * Uses createPortal so that portaled content preserves the source tree's
 * React context -- plugin context, query client, etc. all work naturally.
 *
 * Usage:
 *
 * 1. The app wraps its layout with <TopbarPortalProvider>
 * 2. ProjectTopbar calls useTopbarPortalTargets() and attaches callback refs to slot divs
 * 3. Plugin components render <TopbarPortal side="right">...</TopbarPortal>
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type TopbarSide = "left" | "center" | "right";

interface TopbarPortalContextValue {
  /** Current DOM elements for each slot (null until ProjectTopbar mounts) */
  leftEl: HTMLDivElement | null;
  centerEl: HTMLDivElement | null;
  rightEl: HTMLDivElement | null;
  /** Callback refs for ProjectTopbar to register slot elements */
  setLeftEl: (el: HTMLDivElement | null) => void;
  setCenterEl: (el: HTMLDivElement | null) => void;
  setRightEl: (el: HTMLDivElement | null) => void;
}

const TopbarPortalContext = createContext<TopbarPortalContextValue | null>(
  null,
);

/**
 * Provider that manages the portal target DOM elements for the three topbar slots.
 * Place this in the layout tree so it wraps both the topbar and the content area.
 */
export function TopbarPortalProvider({ children }: { children: ReactNode }) {
  const [leftEl, setLeftEl] = useState<HTMLDivElement | null>(null);
  const [centerEl, setCenterEl] = useState<HTMLDivElement | null>(null);
  const [rightEl, setRightEl] = useState<HTMLDivElement | null>(null);

  return (
    <TopbarPortalContext.Provider
      value={{ leftEl, centerEl, rightEl, setLeftEl, setCenterEl, setRightEl }}
    >
      {children}
    </TopbarPortalContext.Provider>
  );
}

/**
 * Hook used by the ProjectTopbar component to get callback refs for the portal target divs.
 * Returns stable callback refs that register/unregister the DOM elements in the provider.
 */
export function useTopbarPortalTargets() {
  const ctx = useContext(TopbarPortalContext);

  const leftRef = (el: HTMLDivElement | null) => ctx?.setLeftEl(el);
  const centerRef = (el: HTMLDivElement | null) => ctx?.setCenterEl(el);
  const rightRef = (el: HTMLDivElement | null) => ctx?.setRightEl(el);

  if (!ctx) return null;

  return { leftRef, centerRef, rightRef };
}

/**
 * Portal component that renders children into one of the topbar slots.
 *
 * Because this uses React createPortal, the children maintain the React context
 * of the component that renders <TopbarPortal> -- not the topbar's context.
 * This means plugin context (connection, toolCaller, etc.) is available.
 *
 * @example
 * ```tsx
 * import { TopbarPortal, usePluginContext } from "@decocms/mesh-sdk/plugins";
 *
 * function MyPluginPage() {
 *   const { toolCaller } = usePluginContext<typeof MY_BINDING>();
 *
 *   return (
 *     <>
 *       <TopbarPortal side="right">
 *         <Button onClick={() => toolCaller("SOME_TOOL", {})}>
 *           Action
 *         </Button>
 *       </TopbarPortal>
 *       <div>Page content...</div>
 *     </>
 *   );
 * }
 * ```
 */
export function TopbarPortal({
  side,
  children,
}: {
  side: TopbarSide;
  children: ReactNode;
}) {
  const ctx = useContext(TopbarPortalContext);
  if (!ctx) return null;

  const el =
    side === "left"
      ? ctx.leftEl
      : side === "center"
        ? ctx.centerEl
        : ctx.rightEl;

  if (!el) return null;

  return createPortal(children, el);
}
