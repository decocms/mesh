import { useEffect, useRef, useState } from "react";

/**
 * Smart auto-scroll sentinel component that handles auto-scrolling when visible.
 * Uses IntersectionObserver to detect when the user has scrolled away, automatically
 * disabling auto-scroll until they scroll back.
 *
 * This component should be rendered at the end of the last message content during streaming.
 */
export function SmartAutoScroll({
  parts,
}: {
  parts: unknown[] | null | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Extract content dependencies from parts for dependency tracking
  const partsLength = parts?.length;
  const lastPart = parts?.[parts.length - 1];

  // Helper function to find and scroll the scrollable parent container
  const scrollToBottom = () => {
    if (!ref.current) {
      return;
    }

    // Find the scrollable parent container
    let scrollContainer: HTMLElement | null = ref.current.parentElement;
    while (scrollContainer) {
      const style = window.getComputedStyle(scrollContainer);
      if (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflow === "auto" ||
        style.overflow === "scroll"
      ) {
        // Found the scrollable container, scroll to bottom
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        return;
      }
      scrollContainer = scrollContainer.parentElement;
    }
  };

  // Set up IntersectionObserver to track visibility
  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- Observer lifecycle management requires useEffect
  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Component is visible if any part of it (10% threshold) is in viewport
        const isIntersecting = entries[0]?.isIntersecting ?? false;
        setIsVisible(isIntersecting);
      },
      {
        threshold: 0.1, // Trigger when 10% of component is visible
        rootMargin: "0px",
      },
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Periodic scrolling during streaming (only when visible)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- Interval lifecycle management requires useEffect
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const intervalId = setInterval(() => {
      scrollToBottom();
    }, 500);

    return () => {
      clearInterval(intervalId);
    };
  }, [isVisible]);

  // Scroll when content changes (only when visible)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- Content change tracking requires useEffect
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    scrollToBottom();
  }, [isVisible, partsLength, lastPart]);

  return <div ref={ref} className="h-0" />;
}
