/**
 * Image Preview Component
 *
 * Lazily loads and displays image previews using presigned URLs.
 * Only fetches the image when it enters the viewport using Intersection Observer.
 */

import { useState, useRef } from "react";
import { usePluginContext } from "@decocms/bindings";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { useQuery } from "@tanstack/react-query";
import { Image01, Loading01, AlertCircle } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { KEYS } from "../lib/query-keys";

interface ImagePreviewProps {
  objectKey: string;
  alt?: string;
  className?: string;
}

/**
 * Custom hook to detect when an element is visible in the viewport.
 * Uses callback ref pattern - no useEffect needed.
 * Returns [isIntersecting, setRef] where setRef should be passed as the ref prop.
 */
function useIntersectionObserver(
  options?: IntersectionObserverInit,
): [boolean, (node: HTMLElement | null) => void] {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasTriggered = useRef(false);

  // Callback ref - called when element mounts (with node) or unmounts (with null)
  const setRef = (node: HTMLElement | null) => {
    // Cleanup any existing observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    // Set up new observer if we have a node and haven't triggered yet
    if (node && !hasTriggered.current) {
      observerRef.current = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting && !hasTriggered.current) {
          hasTriggered.current = true;
          setIsIntersecting(true);
          observerRef.current?.disconnect();
          observerRef.current = null;
        }
      }, options);

      observerRef.current.observe(node);
    }
  };

  return [isIntersecting, setRef];
}

export function ImagePreview({
  objectKey,
  alt,
  className = "",
}: ImagePreviewProps) {
  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  // Detect when the component is visible (callback ref pattern)
  const [isVisible, setContainerRef] = useIntersectionObserver({
    rootMargin: "100px", // Start loading slightly before it's visible
    threshold: 0,
  });

  // Fetch presigned URL only when visible
  const {
    data: imageUrl,
    isLoading,
    error,
  } = useQuery({
    queryKey: KEYS.imagePreview(connectionId, objectKey),
    queryFn: async () => {
      const { url } = await toolCaller("GET_PRESIGNED_URL", { key: objectKey });
      return url;
    },
    enabled: isVisible, // Only fetch when visible
    staleTime: 5 * 60 * 1000, // 5 minutes - presigned URLs typically last longer
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  return (
    <div
      ref={setContainerRef}
      className={cn(
        "relative w-full h-full flex items-center justify-center overflow-hidden",
        className,
      )}
    >
      {!isVisible || isLoading ? (
        // Placeholder while not visible or loading
        <div className="flex flex-col items-center justify-center text-muted-foreground">
          {isLoading ? (
            <Loading01 size={24} className="animate-spin" />
          ) : (
            <Image01 size={48} />
          )}
        </div>
      ) : error ? (
        // Error state
        <div className="flex flex-col items-center justify-center text-muted-foreground">
          <AlertCircle size={24} />
        </div>
      ) : imageUrl ? (
        // Image loaded
        <img
          src={imageUrl}
          alt={alt || objectKey}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : null}
    </div>
  );
}
