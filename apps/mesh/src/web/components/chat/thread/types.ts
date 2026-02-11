// Constants
export const THREAD_CONSTANTS = {
  /** Page size for thread messages queries */
  THREAD_MESSAGES_PAGE_SIZE: 100,
  /** Page size for threads list queries */
  THREADS_PAGE_SIZE: 50,
  /** Stale time for React Query queries (30 seconds) */
  QUERY_STALE_TIME: 30_000,
} as const;

// Types
export interface Thread {
  id: string;
  title: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  hidden?: boolean;
}

export type { ChatMessage } from "../types.ts";

export type ThreadsInfiniteQueryData = {
  pages: Array<{
    items: Thread[];
    hasMore: boolean;
    totalCount?: number;
  }>;
  pageParams: number[];
};
