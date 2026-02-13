import { useEffect, useState } from "react";

interface UseAutoScrollOptions {
  /**
   * Ref to the scrollable container element.
   * - If provided: used as the IntersectionObserver root AND as the scroll target.
   * - If omitted: observer uses viewport, scroll target is found by walking up from sentinel.
   */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Whether auto-scrolling is enabled. When false, observer still tracks but no scrolling occurs. */
  enabled: boolean;
  /** Dependencies that trigger an immediate scroll when changed (e.g. content length). */
  contentDeps?: unknown[];
  /** IntersectionObserver threshold. Default 0.1 (viewport mode) or 0.95 (container mode). */
  threshold?: number;
  /** Interval in ms for periodic scrolling. Default 500. */
  intervalMs?: number;
}

interface UseAutoScrollReturn {
  /**
   * Callback ref to attach to the sentinel element.
   * Use as: `<div ref={sentinelRef} className="h-0" />`
   * Uses setState callback ref pattern so the observer re-attaches when the sentinel mounts/unmounts.
   */
  sentinelRef: (node: HTMLDivElement | null) => void;
  /** Whether the sentinel is currently visible (user hasn't scrolled away). */
  isTracking: boolean;
}

/**
 * Reusable auto-scroll hook.
 *
 * Place a sentinel `<div ref={sentinelRef} className="h-0" />` at the bottom of the
 * scrollable content. The hook uses IntersectionObserver to detect whether the user
 * has scrolled away. When `enabled && isTracking`, it periodically scrolls to bottom
 * and also scrolls immediately when `contentDeps` change.
 *
 * Two modes:
 * - **Viewport mode** (no `containerRef`): observer root = viewport, scrolls nearest
 *   scrollable parent of the sentinel.
 * - **Container mode** (`containerRef` provided): observer root = container, scrolls
 *   the container directly.
 */
export function useAutoScroll({
  containerRef,
  enabled,
  contentDeps = [],
  threshold,
  intervalMs = 500,
}: UseAutoScrollOptions): UseAutoScrollReturn {
  // Use setState as callback ref so effect re-runs when sentinel mounts/unmounts.
  // This fixes the timing issue where containerRef.current or the sentinel
  // may not be available on the initial effect run (e.g. inside CollapsibleContent).
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  // Resolve default threshold based on mode
  const resolvedThreshold = threshold ?? (containerRef ? 0.95 : 0.1);

  // Helper: scroll to bottom of the target container
  const scrollToBottom = () => {
    // Container mode: scroll the known container
    if (containerRef?.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      return;
    }

    // Viewport mode: walk up from sentinel to find scrollable parent
    if (!sentinelNode) return;
    let el: HTMLElement | null = sentinelNode.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      if (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflow === "auto" ||
        style.overflow === "scroll"
      ) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      el = el.parentElement;
    }
  };

  // 1. IntersectionObserver: track whether sentinel is visible
  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- Observer lifecycle management requires useEffect
  useEffect(() => {
    if (!sentinelNode) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        setIsTracking(visible);
      },
      {
        root: containerRef?.current ?? null,
        threshold: resolvedThreshold,
        rootMargin: "0px",
      },
    );

    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [sentinelNode, resolvedThreshold]); // eslint-disable-line react-hooks/exhaustive-deps -- containerRef.current not in deps: refs don't trigger re-renders; sentinel mount suffices

  // 2. Periodic scroll interval (only when enabled + tracking)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- Interval lifecycle management requires useEffect
  useEffect(() => {
    if (!enabled || !isTracking) return;

    const id = setInterval(scrollToBottom, intervalMs);
    return () => clearInterval(id);
  }, [enabled, isTracking, intervalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Immediate scroll on content changes (only when enabled + tracking)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- Content change tracking requires useEffect
  useEffect(() => {
    if (!enabled || !isTracking) return;
    scrollToBottom();
  }, [enabled, isTracking, ...contentDeps]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sentinelRef: setSentinelNode, isTracking };
}
