import { describe, it, expect, vi } from "bun:test";
import { processConversation } from "./conversation";
import type { MeshContext } from "@/core/mesh-context";
import { createMemory } from "./memory";
import type { ChatMessage } from "./types";

const mockThread = {
  id: "thrd_1",
  organizationId: "org_1",
  title: "Test",
  description: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: "user_1",
  updatedBy: null,
  hidden: false,
};

const createMockCtx = (listMessagesMock: ReturnType<typeof vi.fn>) =>
  ({
    auth: { user: { id: "user_1" }, session: null },
    organization: { id: "org_1", slug: "org-1" },
    storage: {
      threads: {
        get: vi.fn().mockResolvedValue(mockThread),
        create: vi.fn().mockResolvedValue(mockThread),
        list: vi.fn().mockResolvedValue({ threads: [], total: 0 }),
        listMessages: listMessagesMock,
      },
    },
  }) as unknown as MeshContext;

/** Mock that returns messages in desc order when sort is "desc" (newest first) */
const mockListMessages = (threadMessages: ChatMessage[]) => {
  return vi.fn().mockImplementation((_id: string, opts?: { sort?: string }) => {
    const msgs = threadMessages.map((m) => toThreadMessage(m, "thrd_1"));
    const ordered = opts?.sort === "desc" ? [...msgs].reverse() : msgs;
    return Promise.resolve({ messages: ordered, total: msgs.length });
  });
};

const toThreadMessage = (m: ChatMessage, threadId: string) => ({
  ...m,
  threadId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("processConversation", () => {
  describe("ID-based merge", () => {
    it("replaces thread assistant with config assistant when ids match", async () => {
      const threadMessages: ChatMessage[] = [
        {
          id: "msg-user-1",
          role: "user",
          parts: [{ type: "text", text: "Help me" }],
        },
        {
          id: "msg-assistant-1",
          role: "assistant",
          parts: [
            { type: "text", text: "I'll help." },
            {
              type: "tool-user_ask",
              toolCallId: "tc-1",
              state: "input-available" as const,
              input: {
                prompt: "Which option?",
                type: "choice",
                options: ["A", "B"],
              },
            },
          ],
        },
      ];

      const configMessages: ChatMessage[] = [
        {
          id: "msg-assistant-1",
          role: "assistant",
          parts: [
            { type: "text", text: "I'll help." },
            {
              type: "tool-user_ask",
              toolCallId: "tc-1",
              state: "output-available" as const,
              input: {
                prompt: "Which option?",
                type: "choice",
                options: ["A", "B"],
              },
              output: { response: "A" },
            },
          ],
        },
      ];

      const listMessagesMock = mockListMessages(threadMessages);

      const ctx = createMockCtx(listMessagesMock);
      const memory = await createMemory(ctx.storage.threads, {
        organizationId: "org_1",
        threadId: "thrd_1",
        userId: "user_1",
        defaultWindowSize: 50,
      });

      const { originalMessages } = await processConversation(
        memory,
        configMessages[0]!,
        [],
        {
          windowSize: 50,
          models: {
            connectionId: "c1",
            thinking: { id: "m1", capabilities: { text: true } },
          },
        },
      );

      const assistantMsg = originalMessages.find((m) => m.role === "assistant");
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.id).toBe("msg-assistant-1");
      const toolPart = assistantMsg!.parts?.find(
        (p) => p.type === "tool-user_ask" && "output" in p,
      );
      expect(toolPart).toBeDefined();
      expect(
        (toolPart as { output?: { response: string } }).output?.response,
      ).toBe("A");
    });

    it("appends config messages when ids are not in thread", async () => {
      const threadMessages: ChatMessage[] = [
        { id: "msg-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      ];

      const configMessages: ChatMessage[] = [
        {
          id: "msg-2",
          role: "assistant",
          parts: [{ type: "text", text: "Hello!" }],
        },
      ];

      const listMessagesMock = mockListMessages(threadMessages);

      const ctx = createMockCtx(listMessagesMock);
      const memory = await createMemory(ctx.storage.threads, {
        organizationId: "org_1",
        threadId: "thrd_1",
        userId: "user_1",
        defaultWindowSize: 50,
      });

      const { originalMessages } = await processConversation(
        memory,
        configMessages[0]!,
        [],
        {
          windowSize: 50,
          models: {
            connectionId: "c1",
            thinking: { id: "m1", capabilities: { text: true } },
          },
        },
      );

      expect(originalMessages).toHaveLength(2);
      expect(originalMessages[0]!.id).toBe("msg-1");
      expect(originalMessages[1]!.id).toBe("msg-2");
    });

    it("replaces matching message and drops rest of thread", async () => {
      const threadMessages: ChatMessage[] = [
        { id: "msg-1", role: "user", parts: [{ type: "text", text: "A" }] },
        {
          id: "msg-2",
          role: "assistant",
          parts: [{ type: "text", text: "B" }],
        },
        { id: "msg-3", role: "user", parts: [{ type: "text", text: "C" }] },
      ];

      const configMessages: ChatMessage[] = [
        {
          id: "msg-2",
          role: "assistant",
          parts: [{ type: "text", text: "B updated" }],
        },
      ];

      const listMessagesMock = mockListMessages(threadMessages);

      const ctx = createMockCtx(listMessagesMock);
      const memory = await createMemory(ctx.storage.threads, {
        organizationId: "org_1",
        threadId: "thrd_1",
        userId: "user_1",
        defaultWindowSize: 50,
      });

      const { originalMessages } = await processConversation(
        memory,
        configMessages[0]!,
        [],
        {
          windowSize: 50,
          models: {
            connectionId: "c1",
            thinking: { id: "m1", capabilities: { text: true } },
          },
        },
      );

      expect(originalMessages).toHaveLength(2);
      expect(originalMessages[0]!.id).toBe("msg-1");
      expect(originalMessages[1]!.id).toBe("msg-2");
      const part0 = originalMessages[1]!.parts?.[0];
      expect(part0).toBeDefined();
      expect((part0 as { text: string }).text).toBe("B updated");
    });
  });
});
