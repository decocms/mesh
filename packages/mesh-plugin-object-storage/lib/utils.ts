/**
 * Utility functions for Object Storage plugin
 */

/**
 * Get the name of the file/folder from a key
 * e.g., "folder/subfolder/file.txt" -> "file.txt"
 */
export function getFileName(key: string): string {
  const parts = key.split("/").filter(Boolean);
  return parts[parts.length - 1] || key;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Parse path segments for breadcrumb navigation
 */
export function parsePathSegments(
  prefix: string,
): Array<{ name: string; path: string }> {
  const segments: Array<{ name: string; path: string }> = [];
  const parts = prefix.split("/").filter(Boolean);

  let currentPath = "";
  for (const part of parts) {
    currentPath += part + "/";
    segments.push({
      name: part,
      path: currentPath,
    });
  }

  return segments;
}

/**
 * Get MIME type icon name based on content type or file extension
 */
export function getFileIcon(key: string, contentType?: string): string {
  // Check content type first
  if (contentType) {
    if (contentType.startsWith("image/")) return "Image01";
    if (contentType.startsWith("video/")) return "VideoRecorder";
    if (contentType.startsWith("audio/")) return "Music01";
    if (contentType.includes("pdf")) return "File06";
    if (contentType.includes("zip") || contentType.includes("compressed"))
      return "File07";
    if (contentType.includes("json") || contentType.includes("javascript"))
      return "FileCode01";
  }

  // Fall back to extension
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "webp":
    case "svg":
      return "Image01";
    case "mp4":
    case "mov":
    case "avi":
    case "webm":
      return "VideoRecorder";
    case "mp3":
    case "wav":
    case "ogg":
      return "Music01";
    case "pdf":
      return "File06";
    case "zip":
    case "tar":
    case "gz":
    case "rar":
      return "File07";
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
    case "json":
    case "html":
    case "css":
      return "FileCode01";
    case "md":
    case "txt":
      return "File04";
    default:
      return "File02";
  }
}
