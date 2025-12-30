/**
 * Binding Definitions
 *
 * Defines the available bindings and their MCP implementations.
 * Each binding represents a common pattern/interface that MCPs can implement.
 */

export type BindingStatus = "available" | "coming_soon";

export interface BindingImplementation {
  /** Unique identifier for this implementation */
  id: string;
  /** Display name */
  name: string;
  /** Description of this implementation */
  description: string;
  /** Icon URL or emoji */
  icon: string;
  /** NPX package name (for stdio connections) */
  npxPackage?: string;
  /** Local command for development (overrides npxPackage if set) */
  localCommand?: {
    command: string;
    args: string[];
  };
  /** HTTP endpoint (for remote connections) */
  httpEndpoint?: string;
  /** Connection type */
  connectionType: "STDIO" | "HTTP" | "SSE";
  /** Whether this implementation requires configuration */
  requiresConfig?: boolean;
  /** Configuration schema field names */
  configFields?: BindingConfigField[];
  /** Default configuration values */
  defaultConfig?: Record<string, string>;
}

export interface BindingConfigField {
  name: string;
  label: string;
  type: "text" | "path" | "select";
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

export interface BindingDefinition {
  /** Unique identifier for the binding */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Icon for the binding category */
  icon: string;
  /** CSS gradient for the card */
  gradient: string;
  /** Available implementations */
  implementations: BindingImplementation[];
  /** Status: available or coming soon */
  status: BindingStatus;
  /** Well-known binding type from @decocms/bindings */
  bindingType?: string;
}

/**
 * File Storage Binding
 * Implementations: Local File System, S3, etc.
 */
const fileStorageBinding: BindingDefinition = {
  id: "file-storage",
  name: "File Storage",
  description: "Read, write, and manage files on local or cloud storage",
  icon: "📁",
  gradient: "from-blue-500/20 to-cyan-500/20",
  bindingType: "FILE_STORAGE",
  status: "available",
  implementations: [
    {
      id: "local-fs",
      name: "Local File System",
      description: "Access files on your local machine",
      icon: "💻",
      npxPackage: "@decocms/mcp-local-fs",
      // Use local dev path until package is published with structuredContent fix
      localCommand: {
        command: "bun",
        args: [
          "run",
          "/Users/guilherme/Projects/mcps/local-fs/server/stdio.ts",
        ],
      },
      connectionType: "STDIO",
      requiresConfig: true,
      configFields: [
        {
          name: "path",
          label: "Root Path",
          type: "path",
          placeholder: "/Users/you/Documents",
          description: "The folder to mount as the storage root",
          required: true,
        },
      ],
    },
    // {
    //   id: "s3",
    //   name: "Amazon S3",
    //   description: "Access files on Amazon S3 buckets",
    //   icon: "☁️",
    //   npxPackage: "@decocms/mcp-s3",
    //   connectionType: "STDIO",
    //   requiresConfig: true,
    //   configFields: [
    //     {
    //       name: "bucket",
    //       label: "Bucket Name",
    //       type: "text",
    //       placeholder: "my-bucket",
    //       required: true,
    //     },
    //     {
    //       name: "region",
    //       label: "AWS Region",
    //       type: "text",
    //       placeholder: "us-east-1",
    //       required: true,
    //     },
    //   ],
    // },
  ],
};

/**
 * Database Binding
 * Implementations: Readonly SQL, etc.
 */
const databaseBinding: BindingDefinition = {
  id: "database",
  name: "Database",
  description: "Query databases with read-only SQL access",
  icon: "🗄️",
  gradient: "from-purple-500/20 to-pink-500/20",
  bindingType: "DATABASE",
  status: "coming_soon",
  implementations: [
    {
      id: "readonly-sql",
      name: "Readonly SQL",
      description: "Safe read-only access to PostgreSQL, MySQL, SQLite",
      icon: "📊",
      npxPackage: "@decocms/mcp-readonly-sql",
      connectionType: "STDIO",
      requiresConfig: true,
      configFields: [
        {
          name: "connectionString",
          label: "Connection String",
          type: "text",
          placeholder: "postgresql://user:pass@localhost:5432/db",
          required: true,
        },
      ],
    },
  ],
};

/**
 * AI/LLM Binding
 * Implementations: OpenRouter, etc.
 */
const llmBinding: BindingDefinition = {
  id: "llm",
  name: "AI / Language Models",
  description: "Access language models for text generation and chat",
  icon: "🤖",
  gradient: "from-emerald-500/20 to-teal-500/20",
  bindingType: "LANGUAGE_MODEL",
  status: "coming_soon",
  implementations: [
    {
      id: "openrouter",
      name: "OpenRouter",
      description: "Access 100+ AI models through one API",
      icon: "🌐",
      npxPackage: "@decocms/mcp-openrouter",
      connectionType: "STDIO",
      requiresConfig: true,
      configFields: [
        {
          name: "apiKey",
          label: "OpenRouter API Key",
          type: "text",
          placeholder: "sk-or-...",
          required: true,
        },
      ],
    },
  ],
};

/**
 * Search Binding
 * Implementations: Perplexity, etc.
 */
const searchBinding: BindingDefinition = {
  id: "search",
  name: "Web Search",
  description: "Search the web for real-time information",
  icon: "🔍",
  gradient: "from-orange-500/20 to-amber-500/20",
  bindingType: "SEARCH",
  status: "coming_soon",
  implementations: [
    {
      id: "perplexity",
      name: "Perplexity",
      description: "AI-powered search with citations",
      icon: "🔮",
      npxPackage: "@decocms/mcp-perplexity",
      connectionType: "STDIO",
      requiresConfig: true,
      configFields: [
        {
          name: "apiKey",
          label: "Perplexity API Key",
          type: "text",
          placeholder: "pplx-...",
          required: true,
        },
      ],
    },
  ],
};

/**
 * Vector Database Binding
 * Implementations: Pinecone, etc.
 */
const vectorDbBinding: BindingDefinition = {
  id: "vector-db",
  name: "Vector Database",
  description: "Store and search embeddings for semantic search",
  icon: "🧮",
  gradient: "from-rose-500/20 to-red-500/20",
  bindingType: "VECTOR_DB",
  status: "coming_soon",
  implementations: [
    {
      id: "pinecone",
      name: "Pinecone",
      description: "Managed vector database for embeddings",
      icon: "🌲",
      npxPackage: "@decocms/mcp-pinecone",
      connectionType: "STDIO",
      requiresConfig: true,
      configFields: [
        {
          name: "apiKey",
          label: "Pinecone API Key",
          type: "text",
          required: true,
        },
        {
          name: "indexName",
          label: "Index Name",
          type: "text",
          required: true,
        },
      ],
    },
  ],
};

/**
 * Documents Binding
 * Implementations: Notion, Google Docs, etc.
 */
const documentsBinding: BindingDefinition = {
  id: "documents",
  name: "Documents",
  description: "Access and manage documents from various sources",
  icon: "📄",
  gradient: "from-indigo-500/20 to-violet-500/20",
  bindingType: "DOCUMENTS",
  status: "coming_soon",
  implementations: [
    {
      id: "notion",
      name: "Notion",
      description: "Access your Notion workspace",
      icon: "📝",
      httpEndpoint: "https://notion.deco.cx",
      connectionType: "HTTP",
      requiresConfig: true,
      configFields: [
        {
          name: "apiKey",
          label: "Notion Integration Token",
          type: "text",
          placeholder: "secret_...",
          required: true,
        },
      ],
    },
  ],
};

/**
 * Email Binding
 * Implementations: Gmail, SMTP, etc.
 */
const emailBinding: BindingDefinition = {
  id: "email",
  name: "Email",
  description: "Send and receive emails programmatically",
  icon: "📧",
  gradient: "from-sky-500/20 to-blue-500/20",
  bindingType: "EMAIL",
  status: "coming_soon",
  implementations: [
    {
      id: "gmail",
      name: "Gmail",
      description: "Access Gmail via OAuth",
      icon: "📬",
      httpEndpoint: "https://gmail.deco.cx",
      connectionType: "HTTP",
    },
  ],
};

/**
 * Calendar Binding
 * Implementations: Google Calendar, etc.
 */
const calendarBinding: BindingDefinition = {
  id: "calendar",
  name: "Calendar",
  description: "Manage calendar events and schedules",
  icon: "📅",
  gradient: "from-yellow-500/20 to-orange-500/20",
  bindingType: "CALENDAR",
  status: "coming_soon",
  implementations: [
    {
      id: "google-calendar",
      name: "Google Calendar",
      description: "Access Google Calendar via OAuth",
      icon: "🗓️",
      httpEndpoint: "https://calendar.deco.cx",
      connectionType: "HTTP",
    },
  ],
};

/**
 * Media/Transcription Binding
 * Implementations: Whisper, etc.
 */
const mediaBinding: BindingDefinition = {
  id: "media",
  name: "Media & Transcription",
  description: "Transcribe audio and process media files",
  icon: "🎙️",
  gradient: "from-fuchsia-500/20 to-purple-500/20",
  bindingType: "MEDIA",
  status: "coming_soon",
  implementations: [
    {
      id: "whisper",
      name: "Whisper",
      description: "OpenAI Whisper for audio transcription",
      icon: "🎤",
      npxPackage: "@decocms/mcp-whisper",
      connectionType: "STDIO",
      requiresConfig: true,
      configFields: [
        {
          name: "apiKey",
          label: "OpenAI API Key",
          type: "text",
          required: true,
        },
      ],
    },
  ],
};

/**
 * All available binding definitions
 */
export const BINDING_DEFINITIONS: BindingDefinition[] = [
  fileStorageBinding,
  databaseBinding,
  llmBinding,
  searchBinding,
  vectorDbBinding,
  documentsBinding,
  emailBinding,
  calendarBinding,
  mediaBinding,
];

/**
 * Get binding definition by ID
 */
export function getBindingById(id: string): BindingDefinition | undefined {
  return BINDING_DEFINITIONS.find((b) => b.id === id);
}

/**
 * Get available bindings (not coming soon)
 */
export function getAvailableBindings(): BindingDefinition[] {
  return BINDING_DEFINITIONS.filter((b) => b.status === "available");
}

/**
 * Get coming soon bindings
 */
export function getComingSoonBindings(): BindingDefinition[] {
  return BINDING_DEFINITIONS.filter((b) => b.status === "coming_soon");
}
