/**
 * FilePreview Component
 *
 * Preview different file types (images, text, code, etc.)
 */

import { Suspense, lazy, useState } from "react";
import { Loading01 } from "@untitledui/icons";
import { useFileContent } from "@/web/hooks/use-file-storage";
import type { FileEntity } from "@decocms/bindings/file-storage";
import { cn } from "@deco/ui/lib/utils.ts";

// Lazy load the TextEditor to avoid loading Monaco on initial page load
const TextEditor = lazy(() =>
  import("./text-editor").then((mod) => ({ default: mod.TextEditor })),
);

interface FilePreviewProps {
  connectionId: string;
  file: FileEntity;
  className?: string;
}

/**
 * Check if a MIME type is previewable as text
 */
function isTextFile(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/javascript" ||
    mimeType === "application/xml"
  );
}

/**
 * Check if a MIME type is an image
 */
function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Check if a MIME type is a PDF
 */
function isPdfFile(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

/**
 * Check if a MIME type is a video
 */
function isVideoFile(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

/**
 * Check if a MIME type is audio
 */
function isAudioFile(mimeType: string): boolean {
  return mimeType.startsWith("audio/");
}

/**
 * Image with loading state
 */
function ImageWithLoading({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      {/* Loading spinner - shown while image loads */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loading01 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="text-sm text-muted-foreground">
          Failed to load image
        </div>
      )}

      {/* Image - hidden until loaded */}
      <img
        src={src}
        alt={alt}
        className={cn(
          "max-w-full max-h-full object-contain rounded transition-opacity duration-200",
          isLoaded ? "opacity-100" : "opacity-0",
          className,
        )}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

/**
 * PDF viewer using browser's native viewer
 */
function PdfViewer({ url, className }: { url: string; className?: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <div className={cn("relative w-full h-full", className)}>
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <Loading01 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      {hasError ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
          <p className="text-sm">Unable to preview PDF in browser</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Open in new tab
          </a>
        </div>
      ) : (
        <iframe
          src={url}
          className="w-full h-full border-0"
          title="PDF Preview"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      )}
    </div>
  );
}

/**
 * Preview component for different file types
 */
export function FilePreview({
  connectionId,
  file,
  className,
}: FilePreviewProps) {
  const isImage = isImageFile(file.mimeType);
  const isText = isTextFile(file.mimeType);
  const isPdf = isPdfFile(file.mimeType);
  const isVideo = isVideoFile(file.mimeType);
  const isAudio = isAudioFile(file.mimeType);

  // For media files that can use the URL directly, skip content fetch
  const needsContentFetch =
    !isPdf && !isVideo && !isAudio && (isImage || isText);

  // Only fetch content for text files and images
  const { data, isLoading, error } = useFileContent(
    connectionId,
    file.path,
    isImage ? "base64" : "utf-8",
    needsContentFetch,
  );

  // PDF preview using browser's native viewer
  if (isPdf && file.url) {
    return (
      <div className={cn("h-full", className)}>
        <PdfViewer url={file.url} />
      </div>
    );
  }

  // Video preview using HTML5 video element
  if (isVideo && file.url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-black p-4",
          className,
        )}
      >
        <video src={file.url} controls className="max-w-full max-h-full">
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  // Audio preview using HTML5 audio element
  if (isAudio && file.url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-muted/30 p-8",
          className,
        )}
      >
        <audio src={file.url} controls className="w-full max-w-md">
          Your browser does not support the audio tag.
        </audio>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loading01 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full text-sm text-muted-foreground",
          className,
        )}
      >
        Failed to load file
      </div>
    );
  }

  // Image preview with loading state
  if (isImage && data?.content) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-muted/30 p-4",
          className,
        )}
      >
        <ImageWithLoading
          src={`data:${file.mimeType};base64,${data.content}`}
          alt={file.title}
        />
      </div>
    );
  }

  // Text/code editor with Monaco
  if (isText && data?.content !== undefined) {
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="flex flex-col items-center gap-3">
              <Loading01 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Loading editor...
              </span>
            </div>
          </div>
        }
      >
        <TextEditor
          connectionId={connectionId}
          file={file}
          initialContent={data.content}
          className={className}
        />
      </Suspense>
    );
  }

  // Unsupported file type
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center h-full gap-4 text-muted-foreground",
        className,
      )}
    >
      <div className="text-center">
        <p className="font-medium">{file.title}</p>
        <p className="text-sm">{file.mimeType}</p>
        {file.url && (
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline mt-2 inline-block"
          >
            Download file
          </a>
        )}
      </div>
    </div>
  );
}
