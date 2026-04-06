import { describe, it, expect, mock } from "bun:test";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { WrapperTransport, composeTransport } from "./compose-transport.ts";

function createMockTransport(): Transport & {
  sentMessages: JSONRPCMessage[];
  triggerMessage: (msg: JSONRPCMessage) => void;
  triggerError: (err: Error) => void;
  triggerClose: () => void;
} {
  const sentMessages: JSONRPCMessage[] = [];
  const transport: Transport & {
    sentMessages: JSONRPCMessage[];
    triggerMessage: (msg: JSONRPCMessage) => void;
    triggerError: (err: Error) => void;
    triggerClose: () => void;
  } = {
    sentMessages,
    onmessage: undefined,
    onerror: undefined,
    onclose: undefined,
    start: mock(async () => {}),
    send: mock(async (msg: JSONRPCMessage) => {
      sentMessages.push(msg);
    }),
    close: mock(async () => {}),
    triggerMessage(msg: JSONRPCMessage) {
      transport.onmessage?.(msg);
    },
    triggerError(err: Error) {
      transport.onerror?.(err);
    },
    triggerClose() {
      transport.onclose?.();
    },
  };
  return transport;
}

function makeMessage(method: string): JSONRPCMessage {
  return { jsonrpc: "2.0", method, id: 1 } as JSONRPCMessage;
}

class TestWrapperTransport extends WrapperTransport {}

describe("WrapperTransport", () => {
  it("delegates start() to inner transport", async () => {
    const inner = createMockTransport();
    const wrapper = new TestWrapperTransport(inner);
    await wrapper.start();
    expect(inner.start).toHaveBeenCalled();
  });

  it("delegates send() to inner transport via handleOutgoingMessage", async () => {
    const inner = createMockTransport();
    const wrapper = new TestWrapperTransport(inner);
    const msg = makeMessage("test");
    await wrapper.send(msg);
    expect(inner.sentMessages).toHaveLength(1);
    expect(inner.sentMessages[0]).toBe(msg);
  });

  it("delegates close() to inner transport", async () => {
    const inner = createMockTransport();
    const wrapper = new TestWrapperTransport(inner);
    await wrapper.close();
    expect(inner.close).toHaveBeenCalled();
  });

  it("forwards incoming messages from inner to onmessage", async () => {
    const inner = createMockTransport();
    const wrapper = new TestWrapperTransport(inner);
    const received: JSONRPCMessage[] = [];
    wrapper.onmessage = (msg) => received.push(msg);

    await wrapper.start();

    const msg = makeMessage("incoming");
    inner.triggerMessage(msg);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(msg);
  });

  it("forwards errors from inner to onerror", async () => {
    const inner = createMockTransport();
    const wrapper = new TestWrapperTransport(inner);
    const errors: Error[] = [];
    wrapper.onerror = (err) => errors.push(err);

    await wrapper.start();

    const err = new Error("test error");
    inner.triggerError(err);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(err);
  });

  it("forwards close from inner to onclose", async () => {
    const inner = createMockTransport();
    const wrapper = new TestWrapperTransport(inner);
    let closeCalled = false;
    wrapper.onclose = () => {
      closeCalled = true;
    };

    await wrapper.start();
    inner.triggerClose();

    expect(closeCalled).toBe(true);
  });

  it("delegates sessionId to inner transport", () => {
    const inner = createMockTransport();
    (inner as any).sessionId = "test-session-123";
    const wrapper = new TestWrapperTransport(inner);
    expect(wrapper.sessionId).toBe("test-session-123");
  });

  it("returns undefined sessionId when inner has none", () => {
    const inner = createMockTransport();
    const wrapper = new TestWrapperTransport(inner);
    expect(wrapper.sessionId).toBeUndefined();
  });
});

describe("handleOutgoingMessage override", () => {
  it("allows intercepting outgoing messages", async () => {
    const inner = createMockTransport();

    class TaggingTransport extends WrapperTransport {
      protected override async handleOutgoingMessage(
        message: JSONRPCMessage,
      ): Promise<void> {
        const tagged = {
          ...message,
          _tagged: true,
        } as unknown as JSONRPCMessage;
        return this.innerTransport.send(tagged);
      }
    }

    const wrapper = new TaggingTransport(inner);
    await wrapper.send(makeMessage("test"));

    expect(inner.sentMessages).toHaveLength(1);
    expect((inner.sentMessages[0] as any)._tagged).toBe(true);
  });
});

describe("handleIncomingMessage override", () => {
  it("allows intercepting incoming messages", async () => {
    const inner = createMockTransport();

    class FilteringTransport extends WrapperTransport {
      protected override handleIncomingMessage(message: JSONRPCMessage): void {
        if ((message as any).method === "blocked") return;
        this.onmessage?.(message);
      }
    }

    const wrapper = new FilteringTransport(inner);
    const received: JSONRPCMessage[] = [];
    wrapper.onmessage = (msg) => received.push(msg);
    await wrapper.start();

    inner.triggerMessage(makeMessage("blocked"));
    inner.triggerMessage(makeMessage("allowed"));

    expect(received).toHaveLength(1);
    expect((received[0] as any).method).toBe("allowed");
  });
});

describe("composeTransport", () => {
  it("applies middlewares left-to-right", async () => {
    const inner = createMockTransport();
    const order: string[] = [];

    class FirstMiddleware extends WrapperTransport {
      protected override async handleOutgoingMessage(
        message: JSONRPCMessage,
      ): Promise<void> {
        order.push("first");
        return this.innerTransport.send(message);
      }
    }

    class SecondMiddleware extends WrapperTransport {
      protected override async handleOutgoingMessage(
        message: JSONRPCMessage,
      ): Promise<void> {
        order.push("second");
        return this.innerTransport.send(message);
      }
    }

    const composed = composeTransport(
      inner,
      (t) => new FirstMiddleware(t),
      (t) => new SecondMiddleware(t),
    );

    await composed.send(makeMessage("test"));

    // Second wraps First wraps inner
    // send() on composed -> SecondMiddleware.handleOutgoing -> FirstMiddleware.send -> FirstMiddleware.handleOutgoing -> inner.send
    expect(order).toEqual(["second", "first"]);
  });

  it("returns base transport when no middlewares", () => {
    const inner = createMockTransport();
    const result = composeTransport(inner);
    expect(result).toBe(inner);
  });

  it("single middleware wraps correctly", async () => {
    const inner = createMockTransport();
    let intercepted = false;

    class LoggingTransport extends WrapperTransport {
      protected override async handleOutgoingMessage(
        message: JSONRPCMessage,
      ): Promise<void> {
        intercepted = true;
        return this.innerTransport.send(message);
      }
    }

    const composed = composeTransport(inner, (t) => new LoggingTransport(t));

    await composed.send(makeMessage("test"));

    expect(intercepted).toBe(true);
    expect(inner.sentMessages).toHaveLength(1);
  });
});

describe("isRequest / isResponse helpers", () => {
  it("isRequest correctly identifies requests", () => {
    const inner = createMockTransport();

    class TestTransport extends WrapperTransport {
      testIsRequest(msg: JSONRPCMessage): boolean {
        return this.isRequest(msg);
      }
      testIsResponse(msg: JSONRPCMessage): boolean {
        return this.isResponse(msg);
      }
    }

    const t = new TestTransport(inner);

    expect(
      t.testIsRequest({ jsonrpc: "2.0", method: "test", id: 1 } as any),
    ).toBe(true);
    expect(
      t.testIsRequest({
        jsonrpc: "2.0",
        result: {},
        id: 1,
      } as any),
    ).toBe(false);

    expect(
      t.testIsResponse({
        jsonrpc: "2.0",
        result: {},
        id: 1,
      } as any),
    ).toBe(true);
    expect(
      t.testIsResponse({
        jsonrpc: "2.0",
        error: { code: -1, message: "err" },
        id: 1,
      } as any),
    ).toBe(true);
  });
});
