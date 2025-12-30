# File Storage Binding Plan

> A comprehensive plan for implementing file storage capabilities in Deco Mesh, including the `FILE_STORAGE_BINDING`, `mcp-local-fs` default MCP, and drag-and-drop file upload UI.

## ✅ Implementation Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1.1 | FILE_STORAGE_BINDING | ✅ Implemented |
| 1.2 | FileEntity & FolderEntity schemas | ✅ Implemented |
| 1.3 | Collection bindings (FILES, FOLDERS) | ✅ Implemented |
| 2.1 | LocalFileStorage class | ✅ Implemented |
| 2.2 | File tools (READ, WRITE, DELETE, MOVE, COPY, MKDIR) | ✅ Implemented |
| 2.3 | Collection tools (LIST, GET for files/folders) | ✅ Implemented |
| 3.1 | MeshContext.fileStorage | ✅ Implemented |
| 3.2 | /mcp/local-fs route | ✅ Implemented |
| 3.3 | /api/files route for file serving | ✅ Implemented |
| 3.4 | Well-known MCP definition (LOCAL_FS) | ✅ Implemented |
| 4.1 | useFileStorageConnections hook | ✅ Implemented |
| 4.2 | FileDropZone component | ✅ Implemented |
| 4.3 | FileBrowser component | ✅ Implemented |
| 4.4 | FilePreview component | ✅ Implemented |
| 4.5 | FileDetailsView / FolderDetailsView | ✅ Implemented |
| 4.6 | Well-known views registration | ✅ Implemented |
| 5 | Monaco editor integration | 🔜 Phase 2 |
| 5 | File editing via tools | 🔜 Phase 2 |

### Files Created/Modified

**New Files:**
- `packages/bindings/src/well-known/file-storage.ts` - FILE_STORAGE_BINDING definition
- `apps/mesh/src/file-storage/types.ts` - File storage types
- `apps/mesh/src/file-storage/local-fs.ts` - LocalFileStorage implementation
- `apps/mesh/src/file-storage/index.ts` - Module exports
- `apps/mesh/src/tools/files/*.ts` - File tools (read, write, delete, move, copy, mkdir, list)
- `apps/mesh/src/api/routes/local-fs.ts` - MCP route for local-fs
- `apps/mesh/src/api/routes/files.ts` - File serving route
- `apps/mesh/src/web/hooks/use-file-storage.ts` - React hooks
- `apps/mesh/src/web/components/file-drop-zone.tsx` - Drop zone component
- `apps/mesh/src/web/components/files/*.tsx` - File browser/preview
- `apps/mesh/src/web/components/details/file/index.tsx` - Detail views

**Modified Files:**
- `packages/bindings/package.json` - Added file-storage export
- `apps/mesh/src/core/mesh-context.ts` - Added fileStorage property
- `apps/mesh/src/core/context-factory.ts` - File storage initialization
- `apps/mesh/src/core/well-known-mcp.ts` - Added LOCAL_FS definition
- `apps/mesh/src/api/app.ts` - Mounted new routes
- `apps/mesh/src/web/hooks/use-binding.ts` - Added FILE_STORAGE to bindings
- `apps/mesh/src/web/routes/orgs/collection-detail.tsx` - Registered file/folder views

---

## Overview

This plan introduces a first-class file storage system for Deco Mesh that allows:

1. **Drag-and-drop file uploads** - Drop files anywhere in the Mesh UI when a storage provider is available
2. **File/Folder collections** - Browse files and folders as standard collections with custom UI
3. **mcp-local-fs** - A default MCP that stores files in a local `storage/` directory
4. **Extensibility** - Any MCP can implement the `FILE_STORAGE_BINDING` to provide storage (S3, GCS, R2, etc.)

---

## Architecture

### Binding-First Design

Following the existing patterns in `@decocms/bindings`, we define:

```
packages/bindings/src/well-known/
├── file-storage.ts      # FILE_STORAGE_BINDING definition
└── index.ts             # Export file-storage binding

apps/mesh/src/
├── file-storage/        # Core file storage logic
│   ├── index.ts         # Storage manager
│   ├── local-fs.ts      # Local filesystem implementation
│   └── types.ts         # Shared types
├── tools/
│   └── files/           # MCP tools for file operations
│       ├── index.ts
│       ├── schema.ts
│       ├── read.ts
│       ├── write.ts
│       ├── delete.ts
│       └── list.ts
└── web/
    ├── components/
    │   ├── file-drop-zone.tsx     # Global drop zone overlay
    │   ├── files/
    │   │   ├── file-browser.tsx   # Folder view component
    │   │   ├── file-editor.tsx    # Monaco editor for files
    │   │   └── file-preview.tsx   # Preview component
    │   └── details/
    │       └── file/
    │           └── index.tsx      # Well-known file detail view
    └── hooks/
        └── use-file-storage.ts    # React hook for file operations
```

---

## Phase 1: FILE_STORAGE_BINDING

### 1.1 Define the Binding (`packages/bindings/src/well-known/file-storage.ts`)

```typescript
import { z } from "zod";
import type { ToolBinder } from "../core/binder";
import { bindingClient } from "../core/binder";

// ============================================================================
// Entity Schemas
// ============================================================================

/**
 * File metadata schema
 */
export const FileEntitySchema = z.object({
  /** Unique file path (serves as ID) */
  id: z.string().describe("Unique file path/identifier"),
  
  /** Display name */
  title: z.string().describe("File name"),
  
  /** Optional description */
  description: z.string().nullish(),
  
  /** File path relative to storage root */
  path: z.string().describe("File path relative to storage root"),
  
  /** Parent folder path (empty string for root) */
  parent: z.string().describe("Parent folder path"),
  
  /** MIME type */
  mimeType: z.string().describe("MIME type of the file"),
  
  /** File size in bytes */
  size: z.number().describe("File size in bytes"),
  
  /** Whether this is a directory */
  isDirectory: z.boolean().describe("Whether this is a directory"),
  
  /** Created timestamp */
  created_at: z.string().datetime(),
  
  /** Updated timestamp */
  updated_at: z.string().datetime(),
  
  /** Optional URL for direct access (pre-signed URL or public URL) */
  url: z.string().url().optional().describe("Direct access URL"),
  
  /** Optional thumbnail URL for images */
  thumbnailUrl: z.string().url().optional(),
});

export type FileEntity = z.infer<typeof FileEntitySchema>;

/**
 * Folder entity schema (alias for directory)
 */
export const FolderEntitySchema = FileEntitySchema.extend({
  isDirectory: z.literal(true),
  /** Number of items in folder */
  itemCount: z.number().optional().describe("Number of items in folder"),
});

export type FolderEntity = z.infer<typeof FolderEntitySchema>;

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * FILE_READ Input - Read file content
 */
export const FileReadInputSchema = z.object({
  /** File path to read */
  path: z.string().describe("File path to read"),
  
  /** Encoding for text files (default: utf-8) */
  encoding: z.enum(["utf-8", "base64", "binary"]).optional().default("utf-8"),
});

export type FileReadInput = z.infer<typeof FileReadInputSchema>;

export const FileReadOutputSchema = z.object({
  /** File content (text or base64 encoded) */
  content: z.string().describe("File content"),
  
  /** File metadata */
  metadata: FileEntitySchema,
});

export type FileReadOutput = z.infer<typeof FileReadOutputSchema>;

/**
 * FILE_WRITE Input - Write/upload file
 */
export const FileWriteInputSchema = z.object({
  /** File path to write */
  path: z.string().describe("File path to write"),
  
  /** File content (text or base64 encoded) */
  content: z.string().describe("File content (text or base64)"),
  
  /** Content encoding */
  encoding: z.enum(["utf-8", "base64"]).optional().default("utf-8"),
  
  /** MIME type (auto-detected if not provided) */
  mimeType: z.string().optional(),
  
  /** Whether to create parent directories if they don't exist */
  createParents: z.boolean().optional().default(true),
  
  /** Whether to overwrite if file exists */
  overwrite: z.boolean().optional().default(true),
});

export type FileWriteInput = z.infer<typeof FileWriteInputSchema>;

export const FileWriteOutputSchema = z.object({
  /** Written file metadata */
  file: FileEntitySchema,
});

export type FileWriteOutput = z.infer<typeof FileWriteOutputSchema>;

/**
 * FILE_DELETE Input
 */
export const FileDeleteInputSchema = z.object({
  /** Path to delete */
  path: z.string().describe("Path to delete"),
  
  /** Whether to recursively delete directories */
  recursive: z.boolean().optional().default(false),
});

export type FileDeleteInput = z.infer<typeof FileDeleteInputSchema>;

export const FileDeleteOutputSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  deletedCount: z.number().optional(),
});

export type FileDeleteOutput = z.infer<typeof FileDeleteOutputSchema>;

/**
 * FILE_MOVE Input - Move/rename file or folder
 */
export const FileMoveInputSchema = z.object({
  /** Source path */
  from: z.string().describe("Source path"),
  
  /** Destination path */
  to: z.string().describe("Destination path"),
  
  /** Whether to overwrite if destination exists */
  overwrite: z.boolean().optional().default(false),
});

export type FileMoveInput = z.infer<typeof FileMoveInputSchema>;

export const FileMoveOutputSchema = z.object({
  /** Moved file metadata */
  file: FileEntitySchema,
});

export type FileMoveOutput = z.infer<typeof FileMoveOutputSchema>;

/**
 * FILE_COPY Input
 */
export const FileCopyInputSchema = z.object({
  /** Source path */
  from: z.string().describe("Source path"),
  
  /** Destination path */
  to: z.string().describe("Destination path"),
  
  /** Whether to overwrite if destination exists */
  overwrite: z.boolean().optional().default(false),
});

export type FileCopyInput = z.infer<typeof FileCopyInputSchema>;

export const FileCopyOutputSchema = z.object({
  /** Copied file metadata */
  file: FileEntitySchema,
});

export type FileCopyOutput = z.infer<typeof FileCopyOutputSchema>;

/**
 * FILE_MKDIR Input - Create directory
 */
export const FileMkdirInputSchema = z.object({
  /** Directory path to create */
  path: z.string().describe("Directory path to create"),
  
  /** Whether to create parent directories */
  recursive: z.boolean().optional().default(true),
});

export type FileMkdirInput = z.infer<typeof FileMkdirInputSchema>;

export const FileMkdirOutputSchema = z.object({
  /** Created directory metadata */
  folder: FolderEntitySchema,
});

export type FileMkdirOutput = z.infer<typeof FileMkdirOutputSchema>;

/**
 * FILE_UPLOAD_URL Input - Get a pre-signed URL for direct upload
 * (Optional - for backends that support direct upload)
 */
export const FileUploadUrlInputSchema = z.object({
  /** Target path for the upload */
  path: z.string().describe("Target path for upload"),
  
  /** MIME type of file to upload */
  mimeType: z.string().describe("MIME type"),
  
  /** File size in bytes (for validation) */
  size: z.number().optional(),
  
  /** URL expiration in seconds (default: 3600) */
  expiresIn: z.number().optional().default(3600),
});

export type FileUploadUrlInput = z.infer<typeof FileUploadUrlInputSchema>;

export const FileUploadUrlOutputSchema = z.object({
  /** Pre-signed upload URL */
  uploadUrl: z.string().url(),
  
  /** HTTP method to use (PUT or POST) */
  method: z.enum(["PUT", "POST"]),
  
  /** Headers to include with the upload request */
  headers: z.record(z.string()).optional(),
  
  /** Form fields for multipart uploads */
  fields: z.record(z.string()).optional(),
  
  /** URL expiration timestamp */
  expiresAt: z.string().datetime(),
  
  /** Final path where file will be stored */
  path: z.string(),
});

export type FileUploadUrlOutput = z.infer<typeof FileUploadUrlOutputSchema>;

// ============================================================================
// FILE_STORAGE_BINDING Definition
// ============================================================================

/**
 * File Storage Binding
 * 
 * Core tools for file operations. All storage providers must implement these.
 * 
 * Required:
 * - FILE_READ: Read file content
 * - FILE_WRITE: Write/upload file content
 * - FILE_DELETE: Delete file or directory
 * 
 * Optional:
 * - FILE_MOVE: Move/rename files
 * - FILE_COPY: Copy files
 * - FILE_MKDIR: Create directories
 * - FILE_UPLOAD_URL: Get pre-signed upload URL (for direct uploads)
 */
export const FILE_STORAGE_BINDING = [
  {
    name: "FILE_READ" as const,
    inputSchema: FileReadInputSchema,
    outputSchema: FileReadOutputSchema,
  },
  {
    name: "FILE_WRITE" as const,
    inputSchema: FileWriteInputSchema,
    outputSchema: FileWriteOutputSchema,
  },
  {
    name: "FILE_DELETE" as const,
    inputSchema: FileDeleteInputSchema,
    outputSchema: FileDeleteOutputSchema,
  },
  {
    name: "FILE_MOVE" as const,
    inputSchema: FileMoveInputSchema,
    outputSchema: FileMoveOutputSchema,
    opt: true,
  },
  {
    name: "FILE_COPY" as const,
    inputSchema: FileCopyInputSchema,
    outputSchema: FileCopyOutputSchema,
    opt: true,
  },
  {
    name: "FILE_MKDIR" as const,
    inputSchema: FileMkdirInputSchema,
    outputSchema: FileMkdirOutputSchema,
    opt: true,
  },
  {
    name: "FILE_UPLOAD_URL" as const,
    inputSchema: FileUploadUrlInputSchema,
    outputSchema: FileUploadUrlOutputSchema,
    opt: true,
  },
] satisfies ToolBinder[];

/**
 * File Storage Binding Client
 */
export const FileStorageBinding = bindingClient(FILE_STORAGE_BINDING);

export type FileStorageBindingClient = ReturnType<
  typeof FileStorageBinding.forConnection
>;
```

### 1.2 Files Collection Binding

Since files should also be browseable as a collection, we create collection bindings:

```typescript
import { createCollectionBindings } from "./collections";

/**
 * Files collection binding - for browsing files
 * Uses the standard collection pattern for LIST and GET
 */
export const FILES_COLLECTION_BINDING = createCollectionBindings(
  "files",
  FileEntitySchema,
  { readOnly: true } // Mutations go through FILE_WRITE, FILE_DELETE
);

/**
 * Folders collection binding - for browsing folders
 */
export const FOLDERS_COLLECTION_BINDING = createCollectionBindings(
  "folders",
  FolderEntitySchema,
  { readOnly: true }
);
```

---

## Phase 2: mcp-local-fs (Default MCP)

### 2.1 Add as Well-Known MCP

Update `apps/mesh/src/core/well-known-mcp.ts`:

```typescript
export const WellKnownMCPId = {
  SELF: "self",
  REGISTRY: "registry",
  COMMUNITY_REGISTRY: "community-registry",
  LOCAL_FS: "local-fs", // NEW
};

export const WellKnownOrgMCPId = {
  // ... existing
  LOCAL_FS: (org: string) => `${org}_${WellKnownMCPId.LOCAL_FS}`,
};

/**
 * Get well-known connection definition for local file storage.
 * Stores files in a local storage/ directory where mesh is running.
 */
export function getWellKnownLocalFsConnection(
  baseUrl: string,
  orgId: string,
): ConnectionCreateData {
  return {
    id: WellKnownOrgMCPId.LOCAL_FS(orgId),
    title: "Local Files",
    description: "File storage in the local storage/ directory",
    connection_type: "HTTP",
    connection_url: `${baseUrl}/mcp/local-fs`,
    icon: "folder-open", // Use icon name for built-in icons
    app_name: "@deco/local-fs",
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isDefault: true,
      type: "file-storage",
    },
  };
}
```

### 2.2 Local FS Implementation

Create `apps/mesh/src/file-storage/local-fs.ts`:

```typescript
import { mkdir, readFile, writeFile, unlink, stat, readdir, rename, copyFile } from "node:fs/promises";
import { join, dirname, basename, extname } from "node:path";
import { existsSync } from "node:fs";
import type { FileEntity, FolderEntity } from "@decocms/bindings/file-storage";
import mime from "mime-types";

export interface LocalFsConfig {
  /** Root directory for storage (default: ./storage) */
  rootDir: string;
  
  /** Base URL for generating file URLs */
  baseUrl: string;
}

export class LocalFileStorage {
  private rootDir: string;
  private baseUrl: string;

  constructor(config: LocalFsConfig) {
    this.rootDir = config.rootDir;
    this.baseUrl = config.baseUrl;
  }

  private resolvePath(path: string): string {
    // Sanitize path to prevent directory traversal
    const normalized = path.replace(/\.\./g, "").replace(/^\/+/, "");
    return join(this.rootDir, normalized);
  }

  private async ensureDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  private async getMetadata(path: string): Promise<FileEntity> {
    const fullPath = this.resolvePath(path);
    const stats = await stat(fullPath);
    const name = basename(path);
    const parent = dirname(path) === "." ? "" : dirname(path);
    const mimeType = stats.isDirectory()
      ? "inode/directory"
      : mime.lookup(name) || "application/octet-stream";

    return {
      id: path,
      title: name,
      description: null,
      path,
      parent,
      mimeType,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      created_at: stats.birthtime.toISOString(),
      updated_at: stats.mtime.toISOString(),
      url: stats.isDirectory() ? undefined : `${this.baseUrl}/files/${encodeURIComponent(path)}`,
    };
  }

  async read(path: string, encoding: "utf-8" | "base64" | "binary" = "utf-8") {
    const fullPath = this.resolvePath(path);
    const content = await readFile(fullPath);
    
    return {
      content: encoding === "base64" 
        ? content.toString("base64")
        : content.toString("utf-8"),
      metadata: await this.getMetadata(path),
    };
  }

  async write(
    path: string,
    content: string,
    options: {
      encoding?: "utf-8" | "base64";
      createParents?: boolean;
      overwrite?: boolean;
      mimeType?: string;
    } = {}
  ) {
    const fullPath = this.resolvePath(path);
    
    if (options.createParents !== false) {
      await this.ensureDir(dirname(fullPath));
    }
    
    if (!options.overwrite && existsSync(fullPath)) {
      throw new Error(`File already exists: ${path}`);
    }

    const buffer = options.encoding === "base64"
      ? Buffer.from(content, "base64")
      : Buffer.from(content, "utf-8");
    
    await writeFile(fullPath, buffer);
    
    return {
      file: await this.getMetadata(path),
    };
  }

  async delete(path: string, recursive = false) {
    const fullPath = this.resolvePath(path);
    const stats = await stat(fullPath);
    
    if (stats.isDirectory()) {
      if (!recursive) {
        throw new Error("Cannot delete directory without recursive flag");
      }
      // Use fs.rm with recursive option
      const { rm } = await import("node:fs/promises");
      await rm(fullPath, { recursive: true, force: true });
    } else {
      await unlink(fullPath);
    }
    
    return { success: true, path };
  }

  async list(
    folder: string = "",
    options: { limit?: number; offset?: number } = {}
  ): Promise<FileEntity[]> {
    const fullPath = this.resolvePath(folder);
    
    if (!existsSync(fullPath)) {
      return [];
    }
    
    const entries = await readdir(fullPath, { withFileTypes: true });
    const files: FileEntity[] = [];
    
    for (const entry of entries) {
      const entryPath = folder ? `${folder}/${entry.name}` : entry.name;
      files.push(await this.getMetadata(entryPath));
    }
    
    // Apply pagination
    const start = options.offset ?? 0;
    const end = options.limit ? start + options.limit : undefined;
    
    return files.slice(start, end);
  }

  async mkdir(path: string, recursive = true) {
    const fullPath = this.resolvePath(path);
    await mkdir(fullPath, { recursive });
    return { folder: await this.getMetadata(path) as FolderEntity };
  }

  async move(from: string, to: string, overwrite = false) {
    const fromPath = this.resolvePath(from);
    const toPath = this.resolvePath(to);
    
    if (!overwrite && existsSync(toPath)) {
      throw new Error(`Destination already exists: ${to}`);
    }
    
    await this.ensureDir(dirname(toPath));
    await rename(fromPath, toPath);
    
    return { file: await this.getMetadata(to) };
  }

  async copy(from: string, to: string, overwrite = false) {
    const fromPath = this.resolvePath(from);
    const toPath = this.resolvePath(to);
    
    if (!overwrite && existsSync(toPath)) {
      throw new Error(`Destination already exists: ${to}`);
    }
    
    await this.ensureDir(dirname(toPath));
    await copyFile(fromPath, toPath);
    
    return { file: await this.getMetadata(to) };
  }
}
```

### 2.3 MCP Tools

Create tools in `apps/mesh/src/tools/files/`:

```typescript
// apps/mesh/src/tools/files/index.ts
import { defineTool } from "@/core/define-tool";
import {
  FileReadInputSchema,
  FileReadOutputSchema,
  FileWriteInputSchema,
  FileWriteOutputSchema,
  FileDeleteInputSchema,
  FileDeleteOutputSchema,
  FileMoveInputSchema,
  FileMoveOutputSchema,
  FileCopyInputSchema,
  FileCopyOutputSchema,
  FileMkdirInputSchema,
  FileMkdirOutputSchema,
} from "@decocms/bindings/file-storage";
import type { MeshContext } from "@/core/mesh-context";

export function createFileTools(ctx: MeshContext) {
  const storage = ctx.fileStorage; // Local FS instance

  return [
    defineTool({
      name: "FILE_READ",
      description: "Read a file's content from storage",
      inputSchema: FileReadInputSchema,
      outputSchema: FileReadOutputSchema,
      handler: async (input) => storage.read(input.path, input.encoding),
    }),

    defineTool({
      name: "FILE_WRITE",
      description: "Write content to a file in storage",
      inputSchema: FileWriteInputSchema,
      outputSchema: FileWriteOutputSchema,
      handler: async (input) => storage.write(input.path, input.content, {
        encoding: input.encoding,
        createParents: input.createParents,
        overwrite: input.overwrite,
        mimeType: input.mimeType,
      }),
    }),

    defineTool({
      name: "FILE_DELETE",
      description: "Delete a file or directory from storage",
      inputSchema: FileDeleteInputSchema,
      outputSchema: FileDeleteOutputSchema,
      handler: async (input) => storage.delete(input.path, input.recursive),
    }),

    defineTool({
      name: "FILE_MOVE",
      description: "Move or rename a file",
      inputSchema: FileMoveInputSchema,
      outputSchema: FileMoveOutputSchema,
      handler: async (input) => storage.move(input.from, input.to, input.overwrite),
    }),

    defineTool({
      name: "FILE_COPY",
      description: "Copy a file",
      inputSchema: FileCopyInputSchema,
      outputSchema: FileCopyOutputSchema,
      handler: async (input) => storage.copy(input.from, input.to, input.overwrite),
    }),

    defineTool({
      name: "FILE_MKDIR",
      description: "Create a directory",
      inputSchema: FileMkdirInputSchema,
      outputSchema: FileMkdirOutputSchema,
      handler: async (input) => storage.mkdir(input.path, input.recursive),
    }),

    // Collection tools for browsing
    defineTool({
      name: "COLLECTION_FILES_LIST",
      description: "List files in a folder",
      inputSchema: z.object({
        where: z.object({
          parent: z.string().optional(),
        }).optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
      outputSchema: z.object({
        items: z.array(FileEntitySchema),
        totalCount: z.number().optional(),
      }),
      handler: async (input) => {
        const parent = input.where?.parent ?? "";
        const items = await storage.list(parent, {
          limit: input.limit,
          offset: input.offset,
        });
        return { items };
      },
    }),

    defineTool({
      name: "COLLECTION_FILES_GET",
      description: "Get a file by path",
      inputSchema: z.object({ id: z.string() }),
      outputSchema: z.object({ item: FileEntitySchema.nullable() }),
      handler: async (input) => {
        try {
          const metadata = await storage.getMetadata(input.id);
          return { item: metadata };
        } catch {
          return { item: null };
        }
      },
    }),

    defineTool({
      name: "COLLECTION_FOLDERS_LIST",
      description: "List folders",
      inputSchema: z.object({
        where: z.object({
          parent: z.string().optional(),
        }).optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
      outputSchema: z.object({
        items: z.array(FolderEntitySchema),
        totalCount: z.number().optional(),
      }),
      handler: async (input) => {
        const parent = input.where?.parent ?? "";
        const all = await storage.list(parent, {
          limit: input.limit,
          offset: input.offset,
        });
        const items = all.filter((f) => f.isDirectory);
        return { items };
      },
    }),

    defineTool({
      name: "COLLECTION_FOLDERS_GET",
      description: "Get a folder by path",
      inputSchema: z.object({ id: z.string() }),
      outputSchema: z.object({ item: FolderEntitySchema.nullable() }),
      handler: async (input) => {
        try {
          const metadata = await storage.getMetadata(input.id);
          if (!metadata.isDirectory) return { item: null };
          return { item: metadata as FolderEntity };
        } catch {
          return { item: null };
        }
      },
    }),
  ];
}
```

---

## Phase 3: UI Components

### 3.1 File Drop Zone (Global Overlay)

Create `apps/mesh/src/web/components/file-drop-zone.tsx`:

```tsx
import { useFileStorageConnections } from "@/web/hooks/use-file-storage";
import { useDropzone } from "react-dropzone";
import { Upload01 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

interface FileDropZoneProps {
  children: React.ReactNode;
}

export function FileDropZone({ children }: FileDropZoneProps) {
  const { storageConnections, uploadFile, isUploading } = useFileStorageConnections();
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Only show drop zone if we have at least one storage connection
  const hasStorage = storageConnections.length > 0;
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true, // Don't open file picker on click
    noKeyboard: true,
    onDragEnter: () => setIsDragOver(true),
    onDragLeave: () => setIsDragOver(false),
    onDrop: async (acceptedFiles) => {
      setIsDragOver(false);
      
      if (!hasStorage) {
        toast.error("No file storage configured");
        return;
      }
      
      // Upload each file
      for (const file of acceptedFiles) {
        try {
          await uploadFile(file);
          toast.success(`Uploaded ${file.name}`);
        } catch (error) {
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    },
  });
  
  // Only render drop zone if storage is available
  if (!hasStorage) {
    return <>{children}</>;
  }
  
  return (
    <div {...getRootProps()} className="relative h-full">
      <input {...getInputProps()} />
      
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Upload01 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Drop files to upload</h3>
              <p className="text-sm text-muted-foreground">
                Files will be stored in {storageConnections[0]?.title ?? "storage"}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {children}
    </div>
  );
}
```

### 3.2 File Storage Hook

Create `apps/mesh/src/web/hooks/use-file-storage.ts`:

```typescript
import { useConnections } from "@/web/hooks/collections/use-connection";
import { createToolCaller } from "@/tools/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FILE_STORAGE_BINDING } from "@decocms/bindings/file-storage";
import { createBindingChecker } from "@decocms/bindings";

const fileStorageChecker = createBindingChecker(FILE_STORAGE_BINDING);

/**
 * Hook to find connections that implement FILE_STORAGE_BINDING
 */
export function useFileStorageConnections() {
  const { data: connections } = useConnections();
  const queryClient = useQueryClient();
  
  // Filter connections that implement file storage binding
  const storageConnections = (connections ?? []).filter((conn) => {
    const tools = conn.tools?.map((t) => ({ name: t.name })) ?? [];
    return fileStorageChecker.isImplementedBy(tools);
  });
  
  // Use the first available storage connection
  const primaryStorage = storageConnections[0];
  
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!primaryStorage) throw new Error("No storage configured");
      
      const caller = createToolCaller(primaryStorage.id);
      
      // Read file as base64
      const content = await fileToBase64(file);
      
      // Upload via FILE_WRITE
      const result = await caller("FILE_WRITE", {
        path: file.name,
        content,
        encoding: "base64",
        mimeType: file.type,
      });
      
      return result;
    },
    onSuccess: () => {
      // Invalidate file collections
      queryClient.invalidateQueries({ queryKey: ["collection", "files"] });
      queryClient.invalidateQueries({ queryKey: ["collection", "folders"] });
    },
  });
  
  return {
    storageConnections,
    primaryStorage,
    uploadFile: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
  };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

### 3.3 File Browser Component (for Folders Collection)

Create `apps/mesh/src/web/components/files/file-browser.tsx`:

```tsx
import { useCollectionData, useCollectionActions } from "@/web/hooks/use-collections";
import { createToolCaller } from "@/tools/client";
import { Button } from "@deco/ui/components/button";
import { Folder01, File06, ArrowLeft } from "@untitledui/icons";
import { useState } from "react";
import { formatBytes } from "@/web/utils/format";

interface FileBrowserProps {
  connectionId: string;
  initialPath?: string;
}

export function FileBrowser({ connectionId, initialPath = "" }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const toolCaller = createToolCaller(connectionId);
  
  const { data: files } = useCollectionData(
    connectionId,
    "files",
    toolCaller,
    { where: { parent: currentPath } }
  );
  
  const navigateUp = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb / navigation */}
      <div className="flex items-center gap-2 p-3 border-b">
        <Button
          variant="ghost"
          size="sm"
          disabled={!currentPath}
          onClick={navigateUp}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          /{currentPath || ""}
        </span>
      </div>
      
      {/* File list */}
      <div className="flex-1 overflow-auto p-2">
        {files?.items?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Folder01 className="h-12 w-12 mb-2 opacity-30" />
            <span>Empty folder</span>
          </div>
        ) : (
          <div className="space-y-1">
            {files?.items?.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                onClick={() => {
                  if (file.isDirectory) {
                    setCurrentPath(file.path);
                  }
                }}
              >
                {file.isDirectory ? (
                  <Folder01 className="h-5 w-5 text-amber-500" />
                ) : (
                  <File06 className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{file.title}</div>
                  {!file.isDirectory && (
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 3.4 File Editor Component (Monaco)

Create `apps/mesh/src/web/components/files/file-editor.tsx`:

```tsx
import Editor from "@monaco-editor/react";
import { useFileContent, useFileMutations } from "@/web/hooks/use-file-storage";
import { useState } from "react";
import { Button } from "@deco/ui/components/button";
import { Save01 } from "@untitledui/icons";

interface FileEditorProps {
  connectionId: string;
  path: string;
  readOnly?: boolean;
}

export function FileEditor({ connectionId, path, readOnly = false }: FileEditorProps) {
  const { data: file, isLoading } = useFileContent(connectionId, path);
  const { save, isSaving } = useFileMutations(connectionId);
  
  const [localContent, setLocalContent] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Determine language from file extension
  const getLanguage = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      json: "json",
      md: "markdown",
      html: "html",
      css: "css",
      py: "python",
      yaml: "yaml",
      yml: "yaml",
    };
    return languageMap[ext ?? ""] ?? "plaintext";
  };
  
  const handleSave = async () => {
    if (localContent === null) return;
    await save({ path, content: localContent });
    setHasChanges(false);
  };
  
  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center justify-end gap-2 p-2 border-b">
          <Button
            size="sm"
            disabled={!hasChanges || isSaving}
            onClick={handleSave}
          >
            <Save01 className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
      
      {/* Editor */}
      <div className="flex-1">
        <Editor
          defaultValue={file?.content ?? ""}
          language={getLanguage(path)}
          theme="vs-dark"
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: "on",
            automaticLayout: true,
          }}
          onChange={(value) => {
            setLocalContent(value ?? "");
            setHasChanges(value !== file?.content);
          }}
        />
      </div>
    </div>
  );
}
```

### 3.5 Register Well-Known Views

Update `apps/mesh/src/web/routes/orgs/collection-detail.tsx`:

```typescript
import { AssistantDetailsView } from "@/web/components/details/assistant/index.tsx";
import { FileDetailsView } from "@/web/components/details/file/index.tsx";
import { FolderDetailsView } from "@/web/components/details/folder/index.tsx";

const WELL_KNOWN_VIEW_DETAILS: Record<
  string,
  ComponentType<CollectionDetailsProps>
> = {
  assistant: AssistantDetailsView,
  files: FileDetailsView,      // NEW
  folders: FolderDetailsView,  // NEW
};
```

---

## Phase 4: Integration

### 4.1 Mount Drop Zone in Shell Layout

Update `apps/mesh/src/web/layouts/shell.tsx`:

```tsx
import { FileDropZone } from "@/web/components/file-drop-zone";

export function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <FileDropZone>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </FileDropZone>
  );
}
```

### 4.2 Add MCP Route for Local FS

Update `apps/mesh/src/api/routes/` to add the local-fs MCP endpoint.

### 4.3 Initialize Local FS on Startup

Update mesh startup to:
1. Create `storage/` directory if it doesn't exist
2. Register the `local-fs` connection for each organization

---

## Implementation Order

### Phase 1 (Foundation) - Week 1
1. [ ] Create `FILE_STORAGE_BINDING` in `packages/bindings/src/well-known/file-storage.ts`
2. [ ] Add exports to `packages/bindings/package.json`
3. [ ] Create `LocalFileStorage` class in `apps/mesh/src/file-storage/local-fs.ts`
4. [ ] Create file tools in `apps/mesh/src/tools/files/`

### Phase 2 (MCP) - Week 1-2
5. [ ] Add `LOCAL_FS` to `well-known-mcp.ts`
6. [ ] Create MCP route at `/mcp/local-fs`
7. [ ] Auto-register local-fs connection on org creation
8. [ ] Add file serving route for downloads

### Phase 3 (UI - Basic) - Week 2
9. [ ] Create `useFileStorageConnections` hook
10. [ ] Create `FileDropZone` component
11. [ ] Mount drop zone in shell layout
12. [ ] Test file uploads

### Phase 4 (UI - Enhanced) - Week 3
13. [ ] Create `FileBrowser` component
14. [ ] Create `FileEditor` component (Monaco)
15. [ ] Create `FilePreview` component (images, PDFs)
16. [ ] Register `FileDetailsView` and `FolderDetailsView` in well-known views

### Phase 5 (Polish) - Week 3-4
17. [ ] Add upload progress indicators
18. [ ] Add file type icons
19. [ ] Add context menu (download, rename, delete)
20. [ ] Add keyboard shortcuts
21. [ ] Add search/filter for files

---

## Future Extensions

### Cloud Storage Adapters

The `FILE_STORAGE_BINDING` can be implemented by other MCPs:

- **mcp-s3** - Amazon S3 storage
- **mcp-gcs** - Google Cloud Storage
- **mcp-r2** - Cloudflare R2
- **mcp-azure-blob** - Azure Blob Storage

### Advanced Features

- **Versioning** - Track file versions with history
- **Thumbnails** - Auto-generate image thumbnails
- **Search** - Full-text search in files
- **Sharing** - Public links with expiration
- **Sync** - Two-way sync with local filesystem

---

## Testing

### Unit Tests
- `LocalFileStorage` class methods
- Path sanitization and security
- MIME type detection

### Integration Tests
- File upload via MCP tools
- Collection binding responses
- Drop zone functionality

### E2E Tests
- Drag and drop file upload
- File browser navigation
- Monaco editor save

---

## Security Considerations

1. **Path Traversal** - Sanitize all paths to prevent `../` attacks
2. **File Size Limits** - Configure max upload size
3. **MIME Type Validation** - Validate content matches declared type
4. **Access Control** - Respect organization boundaries
5. **Rate Limiting** - Prevent upload abuse

