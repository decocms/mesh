import { beforeEach, describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  buildCollectionQueryKey,
  EMPTY_COLLECTION_LIST_RESULT,
} from "@decocms/mesh-sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Test the core prefilling logic directly
describe("Collection Cache Prefill Logic", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  it("should build correct query key for THREAD_MESSAGES", () => {
    const mockClient = {} as Client;
    const queryKey = buildCollectionQueryKey(
      mockClient,
      "THREAD_MESSAGES",
      "org-123",
      {
        filters: [{ column: "threadId", value: "test-thread" }],
        pageSize: 100,
      },
    );

    expect(queryKey).not.toBeNull();
    if (queryKey) {
      expect(queryKey[0]).toBe("mcp");
      expect(queryKey[1]).toBe("client");
      expect(queryKey[3]).toBe("tool-call");
      expect(queryKey[4]).toBe("COLLECTION_THREAD_MESSAGES_LIST");
    }
  });

  it("should return null query key for null client", () => {
    const queryKey = buildCollectionQueryKey(
      null,
      "THREAD_MESSAGES",
      "org-123",
      {},
    );

    expect(queryKey).toBeNull();
  });

  it("should return null query key for undefined client", () => {
    const queryKey = buildCollectionQueryKey(
      undefined,
      "THREAD_MESSAGES",
      "org-123",
      {},
    );

    expect(queryKey).toBeNull();
  });

  it("should prefill cache with empty result structure", () => {
    const mockClient = {} as Client;
    const queryKey = buildCollectionQueryKey(
      mockClient,
      "THREAD_MESSAGES",
      "org-123",
      {
        filters: [{ column: "threadId", value: "test-thread" }],
      },
    );

    if (!queryKey) {
      throw new Error("Query key should not be null");
    }

    // Simulate the prefilling logic
    const existingData = queryClient.getQueryData(queryKey);
    expect(existingData).toBeUndefined();

    // Prefill with empty result
    const emptyResult = {
      structuredContent: {
        items: [],
      },
      isError: false,
    };

    queryClient.setQueryData(queryKey, emptyResult);

    const cachedData = queryClient.getQueryData(queryKey);
    expect(cachedData).toEqual(emptyResult);
    expect(cachedData).toEqual(EMPTY_COLLECTION_LIST_RESULT);
  });

  it("should not overwrite existing cache data", () => {
    const mockClient = {} as Client;
    const queryKey = buildCollectionQueryKey(
      mockClient,
      "THREAD_MESSAGES",
      "org-123",
      {
        filters: [{ column: "threadId", value: "test-thread" }],
      },
    );

    if (!queryKey) {
      throw new Error("Query key should not be null");
    }

    // Pre-populate cache with existing data
    const existingData = {
      structuredContent: {
        items: [{ id: "existing-item" }],
      },
      isError: false,
    };

    queryClient.setQueryData(queryKey, existingData);

    // Simulate checking for existing data (should skip prefilling)
    const cachedBeforePrefill = queryClient.getQueryData(queryKey);
    expect(cachedBeforePrefill).toEqual(existingData);

    // Even if we try to prefill, the logic should check first
    const shouldSkip = queryClient.getQueryData(queryKey) !== undefined;
    expect(shouldSkip).toBe(true);
  });

  it("should handle different collection names", () => {
    const mockClient = {} as Client;

    const threadsKey = buildCollectionQueryKey(
      mockClient,
      "THREADS",
      "org-123",
      {},
    );
    const messagesKey = buildCollectionQueryKey(
      mockClient,
      "THREAD_MESSAGES",
      "org-123",
      {},
    );

    expect(threadsKey).not.toBeNull();
    expect(messagesKey).not.toBeNull();

    if (threadsKey && messagesKey) {
      expect(threadsKey[4]).toBe("COLLECTION_THREADS_LIST");
      expect(messagesKey[4]).toBe("COLLECTION_THREAD_MESSAGES_LIST");
    }
  });
});
