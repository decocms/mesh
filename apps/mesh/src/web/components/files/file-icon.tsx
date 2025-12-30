/**
 * FileIcon Component
 *
 * Renders an icon based on file type, extension, or mime type.
 * Used in both FileBrowser and CollectionsList for consistent file display.
 */

import {
  Folder,
  File06,
  FileCode01,
  Image01,
  FileCheck02,
  File04,
  PlayCircle,
  Archive,
  Database01,
  FileMinus02,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";

interface FileIconProps {
  /** File path or filename to detect extension */
  path?: string;
  /** MIME type for more accurate detection */
  mimeType?: string;
  /** Whether this is a directory */
  isDirectory?: boolean;
  /** Size class - affects both icon and container size */
  size?: "sm" | "md" | "lg";
  /** Additional className */
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

const CONTAINER_CLASSES = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

/**
 * Get icon component and color based on file type
 */
function getFileIconConfig(
  path?: string,
  mimeType?: string,
  isDirectory?: boolean,
): { Icon: typeof File06; colorClass: string; bgClass: string } {
  // Directories
  if (isDirectory) {
    return {
      Icon: Folder,
      colorClass: "text-amber-600",
      bgClass: "bg-amber-100 dark:bg-amber-900/30",
    };
  }

  const ext = path?.split(".").pop()?.toLowerCase();

  // Check by MIME type first
  if (mimeType) {
    if (mimeType.startsWith("image/")) {
      return {
        Icon: Image01,
        colorClass: "text-pink-600",
        bgClass: "bg-pink-100 dark:bg-pink-900/30",
      };
    }
    if (mimeType.startsWith("audio/")) {
      return {
        Icon: PlayCircle,
        colorClass: "text-green-600",
        bgClass: "bg-green-100 dark:bg-green-900/30",
      };
    }
    if (mimeType.startsWith("video/")) {
      return {
        Icon: PlayCircle,
        colorClass: "text-red-600",
        bgClass: "bg-red-100 dark:bg-red-900/30",
      };
    }
    if (mimeType === "application/pdf") {
      return {
        Icon: File04,
        colorClass: "text-red-600",
        bgClass: "bg-red-100 dark:bg-red-900/30",
      };
    }
    if (
      mimeType === "application/zip" ||
      mimeType === "application/x-tar" ||
      mimeType === "application/gzip"
    ) {
      return {
        Icon: Archive,
        colorClass: "text-yellow-600",
        bgClass: "bg-yellow-100 dark:bg-yellow-900/30",
      };
    }
  }

  // Check by extension
  // Code files
  if (
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "json",
      "html",
      "css",
      "scss",
      "py",
      "go",
      "rs",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "swift",
      "kt",
      "rb",
      "php",
      "sh",
      "bash",
      "zsh",
      "yaml",
      "yml",
      "toml",
      "xml",
      "vue",
      "svelte",
    ].includes(ext ?? "")
  ) {
    return {
      Icon: FileCode01,
      colorClass: "text-blue-600",
      bgClass: "bg-blue-100 dark:bg-blue-900/30",
    };
  }

  // Markdown / Documentation
  if (["md", "mdx", "markdown", "rst", "txt"].includes(ext ?? "")) {
    return {
      Icon: FileCheck02,
      colorClass: "text-purple-600",
      bgClass: "bg-purple-100 dark:bg-purple-900/30",
    };
  }

  // Images
  if (
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "ico", "bmp", "tiff"].includes(
      ext ?? "",
    )
  ) {
    return {
      Icon: Image01,
      colorClass: "text-pink-600",
      bgClass: "bg-pink-100 dark:bg-pink-900/30",
    };
  }

  // Audio
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext ?? "")) {
    return {
      Icon: PlayCircle,
      colorClass: "text-green-600",
      bgClass: "bg-green-100 dark:bg-green-900/30",
    };
  }

  // Video
  if (["mp4", "webm", "mov", "avi", "mkv", "m4v"].includes(ext ?? "")) {
    return {
      Icon: PlayCircle,
      colorClass: "text-red-600",
      bgClass: "bg-red-100 dark:bg-red-900/30",
    };
  }

  // Archives
  if (["zip", "tar", "gz", "rar", "7z", "bz2"].includes(ext ?? "")) {
    return {
      Icon: Archive,
      colorClass: "text-yellow-600",
      bgClass: "bg-yellow-100 dark:bg-yellow-900/30",
    };
  }

  // Database / Data
  if (["db", "sqlite", "sql", "csv"].includes(ext ?? "")) {
    return {
      Icon: Database01,
      colorClass: "text-emerald-600",
      bgClass: "bg-emerald-100 dark:bg-emerald-900/30",
    };
  }

  // PDF
  if (ext === "pdf") {
    return {
      Icon: File04,
      colorClass: "text-red-600",
      bgClass: "bg-red-100 dark:bg-red-900/30",
    };
  }

  // Lock files / config
  if (["lock", "lockb"].includes(ext ?? "")) {
    return {
      Icon: FileMinus02,
      colorClass: "text-gray-500",
      bgClass: "bg-gray-100 dark:bg-gray-800",
    };
  }

  // Default
  return {
    Icon: File06,
    colorClass: "text-muted-foreground",
    bgClass: "bg-muted",
  };
}

/**
 * FileIcon - displays a colorful icon based on file type
 *
 * @example
 * <FileIcon path="document.pdf" size="md" />
 * <FileIcon path="folder" isDirectory size="lg" />
 * <FileIcon path="image.png" mimeType="image/png" />
 */
export function FileIcon({
  path,
  mimeType,
  isDirectory,
  size = "md",
  className,
}: FileIconProps) {
  const { Icon, colorClass, bgClass } = getFileIconConfig(
    path,
    mimeType,
    isDirectory,
  );

  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center shrink-0",
        bgClass,
        CONTAINER_CLASSES[size],
        className,
      )}
    >
      <Icon className={cn(SIZE_CLASSES[size], colorClass)} />
    </div>
  );
}

/**
 * FileIconInline - just the icon without container, for inline use
 */
export function FileIconInline({
  path,
  mimeType,
  isDirectory,
  size = "md",
  className,
}: FileIconProps) {
  const { Icon, colorClass } = getFileIconConfig(path, mimeType, isDirectory);

  return <Icon className={cn(SIZE_CLASSES[size], colorClass, className)} />;
}

export { getFileIconConfig };
