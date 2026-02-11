import { useState } from "react";
import { useMCPClient, useProjectContext } from "@decocms/mesh-sdk";
import { toast } from "sonner";

interface UseImageUploadResult {
  uploadImage: (file: File, path: string) => Promise<string | null>;
  isUploading: boolean;
}

/**
 * Hook for uploading images to object storage
 *
 * @param connectionId - Optional connection ID for object storage (defaults to dev-assets)
 * @returns Upload function and loading state
 */
export function useImageUpload(connectionId?: string): UseImageUploadResult {
  const { org } = useProjectContext();
  const [isUploading, setIsUploading] = useState(false);

  // Use dev-assets in development, or provided connection ID
  const storageConnectionId = connectionId || `${org.id}_dev-assets`;

  const client = useMCPClient({
    connectionId: storageConnectionId,
    orgId: org.id,
  });

  const uploadImage = async (
    file: File,
    path: string,
  ): Promise<string | null> => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return null;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return null;
    }

    setIsUploading(true);

    try {
      // Step 1: Get presigned URL for upload
      const presignedResult = (await client.callTool({
        name: "PUT_PRESIGNED_URL",
        arguments: {
          key: path,
          contentType: file.type,
        },
      })) as { url?: string; structuredContent?: { url: string } };

      const presignedUrl =
        presignedResult.structuredContent?.url || presignedResult.url;

      if (!presignedUrl) {
        throw new Error("Failed to get presigned URL");
      }

      // Step 2: Upload file to presigned URL
      const uploadResponse = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      // Step 3: Get the public URL for the uploaded file
      const downloadResult = (await client.callTool({
        name: "GET_PRESIGNED_URL",
        arguments: {
          key: path,
          expiresIn: 31536000, // 1 year
        },
      })) as { url?: string; structuredContent?: { url: string } };

      const publicUrl =
        downloadResult.structuredContent?.url || downloadResult.url;

      if (!publicUrl) {
        throw new Error("Failed to get public URL");
      }

      return publicUrl;
    } catch (error) {
      console.error("Image upload failed:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to upload image. Please try again.",
      );
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadImage,
    isUploading,
  };
}
