/**
 * Loader Registry - Manages saved loaders that can be reused across the app
 * 
 * Key concepts:
 * - Saved loaders have an ID and configuration
 * - When a loader is used in multiple places, it's only called once per request
 * - Loaders are referenced by their ID (e.g., "#loaders/product-list")
 */

import type { JSONSchema7 } from "../types/json-schema";

export interface LoaderConfig {
  /** Unique identifier for this saved loader instance */
  id: string;
  /** Human-readable name */
  name: string;
  /** The loader type (e.g., "site/loaders/ProductList.ts") */
  __resolveType: string;
  /** Loader configuration/props */
  props: Record<string, unknown>;
  /** When this loader was created */
  createdAt: string;
  /** When this loader was last updated */
  updatedAt: string;
}

export interface LoaderDefinition {
  /** The loader type path */
  type: string;
  /** Human-readable name */
  name: string;
  /** Description of what this loader does */
  description?: string;
  /** Category for grouping */
  category: "product" | "content" | "commerce" | "custom";
  /** JSON Schema for the loader's props */
  schema: JSONSchema7;
  /** Icon to display */
  icon?: string;
}

// Built-in loader definitions
export const BUILTIN_LOADERS: LoaderDefinition[] = [
  {
    type: "site/loaders/ProductDetailLoader.ts",
    name: "Product Detail",
    description: "Load a single product by slug or ID",
    category: "product",
    schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Product slug" },
        id: { type: "string", description: "Product ID (alternative to slug)" },
      },
    },
  },
  {
    type: "site/loaders/ProductListLoader.ts",
    name: "Product List",
    description: "Load a list of products with filters",
    category: "product",
    schema: {
      type: "object",
      properties: {
        collection: { type: "string", description: "Collection slug" },
        limit: { type: "number", description: "Max products to return", default: 12 },
        offset: { type: "number", description: "Pagination offset", default: 0 },
        sort: {
          type: "string",
          enum: ["price_asc", "price_desc", "name_asc", "name_desc", "newest"],
          description: "Sort order",
        },
      },
    },
  },
  {
    type: "site/loaders/ProductSearchLoader.ts",
    name: "Product Search",
    description: "Search products by query",
    category: "product",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results", default: 20 },
        filters: {
          type: "object",
          description: "Filter facets",
          additionalProperties: { type: "string" },
        },
      },
    },
  },
  {
    type: "site/loaders/CartLoader.ts",
    name: "Cart",
    description: "Load the current user's cart",
    category: "commerce",
    schema: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "site/loaders/WishlistLoader.ts",
    name: "Wishlist",
    description: "Load the current user's wishlist",
    category: "commerce",
    schema: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "site/loaders/ContentLoader.ts",
    name: "Content",
    description: "Load CMS content by path",
    category: "content",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Content path" },
        locale: { type: "string", description: "Locale code" },
      },
    },
  },
  {
    type: "site/loaders/NavigationLoader.ts",
    name: "Navigation",
    description: "Load site navigation/menu",
    category: "content",
    schema: {
      type: "object",
      properties: {
        menuId: { type: "string", description: "Menu identifier" },
        depth: { type: "number", description: "Max nesting depth", default: 3 },
      },
    },
  },
];

/**
 * Loader Registry Store
 */
class LoaderRegistry {
  private savedLoaders: Map<string, LoaderConfig> = new Map();
  private loaderDefinitions: Map<string, LoaderDefinition> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    // Initialize with built-in loaders
    for (const def of BUILTIN_LOADERS) {
      this.loaderDefinitions.set(def.type, def);
    }

    // Create some default saved instances
    this.createDefaultSavedLoaders();
  }

  private createDefaultSavedLoaders() {
    const now = new Date().toISOString();

    // Product List - Featured
    this.savedLoaders.set("loaders/featured-products", {
      id: "loaders/featured-products",
      name: "Featured Products",
      __resolveType: "site/loaders/ProductListLoader.ts",
      props: {
        collection: "featured",
        limit: 8,
        sort: "newest",
      },
      createdAt: now,
      updatedAt: now,
    });

    // Product List - Best Sellers
    this.savedLoaders.set("loaders/best-sellers", {
      id: "loaders/best-sellers",
      name: "Best Sellers",
      __resolveType: "site/loaders/ProductListLoader.ts",
      props: {
        collection: "best-sellers",
        limit: 12,
        sort: "price_desc",
      },
      createdAt: now,
      updatedAt: now,
    });

    // Product Detail - Current
    this.savedLoaders.set("loaders/current-product", {
      id: "loaders/current-product",
      name: "Current Product (from URL)",
      __resolveType: "site/loaders/ProductDetailLoader.ts",
      props: {
        slug: "{{route.slug}}", // Placeholder for dynamic resolution
      },
      createdAt: now,
      updatedAt: now,
    });

    // Search Results
    this.savedLoaders.set("loaders/search-results", {
      id: "loaders/search-results",
      name: "Search Results",
      __resolveType: "site/loaders/ProductSearchLoader.ts",
      props: {
        query: "{{url.searchParams.q}}",
        limit: 24,
      },
      createdAt: now,
      updatedAt: now,
    });

    // Cart
    this.savedLoaders.set("loaders/cart", {
      id: "loaders/cart",
      name: "Shopping Cart",
      __resolveType: "site/loaders/CartLoader.ts",
      props: {},
      createdAt: now,
      updatedAt: now,
    });

    // Main Navigation
    this.savedLoaders.set("loaders/main-nav", {
      id: "loaders/main-nav",
      name: "Main Navigation",
      __resolveType: "site/loaders/NavigationLoader.ts",
      props: {
        menuId: "main",
        depth: 3,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  // Get all saved loaders
  getSavedLoaders(): LoaderConfig[] {
    return Array.from(this.savedLoaders.values());
  }

  // Get a saved loader by ID
  getSavedLoader(id: string): LoaderConfig | undefined {
    // Handle both "#loaders/..." and "loaders/..." formats
    const normalizedId = id.startsWith("#") ? id.slice(1) : id;
    return this.savedLoaders.get(normalizedId);
  }

  // Save a new loader or update existing
  saveLoader(config: Omit<LoaderConfig, "createdAt" | "updatedAt">): LoaderConfig {
    const existing = this.savedLoaders.get(config.id);
    const now = new Date().toISOString();

    const saved: LoaderConfig = {
      ...config,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.savedLoaders.set(config.id, saved);
    this.notifyListeners();
    return saved;
  }

  // Delete a saved loader
  deleteLoader(id: string): boolean {
    const result = this.savedLoaders.delete(id);
    if (result) this.notifyListeners();
    return result;
  }

  // Get all loader definitions (types)
  getLoaderDefinitions(): LoaderDefinition[] {
    return Array.from(this.loaderDefinitions.values());
  }

  // Get loader definition by type
  getLoaderDefinition(type: string): LoaderDefinition | undefined {
    return this.loaderDefinitions.get(type);
  }

  // Register a custom loader definition
  registerLoader(definition: LoaderDefinition): void {
    this.loaderDefinitions.set(definition.type, definition);
    this.notifyListeners();
  }

  // Subscribe to changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // Generate JSON Schema for selecting a saved loader
  generateLoaderSelectSchema(): JSONSchema7 {
    const savedLoaders = this.getSavedLoaders();

    return {
      type: "object",
      properties: {
        __resolveType: {
          type: "string",
          enum: savedLoaders.map((l) => `#${l.id}`),
          enumNames: savedLoaders.map((l) => l.name),
        },
      },
      required: ["__resolveType"],
    };
  }
}

// Singleton instance
export const loaderRegistry = new LoaderRegistry();

/**
 * Request-scoped loader cache for deduplication
 * 
 * This ensures that the same loader is only called once per request,
 * even if it's used in multiple places on the page.
 */
export class LoaderRequestCache {
  private cache: Map<string, Promise<unknown>> = new Map();
  private resolved: Map<string, unknown> = new Map();

  /**
   * Get or fetch a loader's data
   * If the loader was already fetched in this request, return the cached result
   */
  async getOrFetch<T>(
    loaderId: string,
    fetcher: () => Promise<T>
  ): Promise<T> {
    // Check if already resolved
    if (this.resolved.has(loaderId)) {
      return this.resolved.get(loaderId) as T;
    }

    // Check if fetch is in progress
    if (this.cache.has(loaderId)) {
      return this.cache.get(loaderId) as Promise<T>;
    }

    // Start new fetch
    const promise = fetcher().then((result) => {
      this.resolved.set(loaderId, result);
      this.cache.delete(loaderId);
      return result;
    });

    this.cache.set(loaderId, promise);
    return promise;
  }

  /**
   * Check if a loader has been resolved
   */
  isResolved(loaderId: string): boolean {
    return this.resolved.has(loaderId);
  }

  /**
   * Get the resolved value (or undefined if not yet resolved)
   */
  getResolved<T>(loaderId: string): T | undefined {
    return this.resolved.get(loaderId) as T | undefined;
  }

  /**
   * Clear the cache (call at the start of a new request)
   */
  clear(): void {
    this.cache.clear();
    this.resolved.clear();
  }
}

// Export a request cache factory
export function createRequestCache(): LoaderRequestCache {
  return new LoaderRequestCache();
}

