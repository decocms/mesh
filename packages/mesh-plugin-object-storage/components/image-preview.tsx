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
import { KEYS } from "../lib/query-keys";

interface ImagePreviewProps {
  objectKey: string;
  alt?: string;
  className?: string;
}

/**
 * Custom hook to detect when an element is visible in the viewport
 */
function useIntersectionObserver(
  ref: React.RefObject<HTMLElement | null>,
  options?: IntersectionObserverInit,
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  // Use a ref to track if we've already triggered (only trigger once)
  const hasTriggered = useRef(false);

  // Set up the observer
  if (typeof window !== "undefined" && ref.current && !hasTriggered.current) {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !hasTriggered.current) {
        hasTriggered.current = true;
        setIsIntersecting(true);
        observer.disconnect();
      }
    }, options);

    observer.observe(ref.current);

    // Cleanup handled by disconnect on intersection
  }

  return isIntersecting;
}

export function ImagePreview({
  objectKey,
  alt,
  className = "",
}: ImagePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  // Detect when the component is visible
  const isVisible = useIntersectionObserver(containerRef, {
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
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden ${className}`}
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
