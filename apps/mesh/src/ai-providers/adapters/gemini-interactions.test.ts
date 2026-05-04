import { afterEach, describe, expect, test } from "bun:test";
import {
  isInteractionsOnlyModel,
  pollInteraction,
  submitInteraction,
} from "./gemini-interactions";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Mock fetch with a queue of canned responses. Each call dequeues one.
 * Returns the captured request URLs/methods so tests can assert call sequence.
 */
function queueFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; method: string }> = [];
  const queue = [...responses];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
    });
    const next = queue.shift();
    if (!next) throw new Error("queueFetch: out of responses");
    return next();
  }) as unknown as typeof fetch;
  return calls;
}

describe("isInteractionsOnlyModel", () => {
  test("matches deep-research preview ids", () => {
    expect(isInteractionsOnlyModel("deep-research-preview-04-2026")).toBe(true);
    expect(isInteractionsOnlyModel("deep-research-max-preview-04-2026")).toBe(
      true,
    );
  });
  test("rejects regular models", () => {
    expect(isInteractionsOnlyModel("gemini-2.5-flash")).toBe(false);
    expect(isInteractionsOnlyModel("gemini-3-flash-preview")).toBe(false);
    expect(isInteractionsOnlyModel("imagen-4")).toBe(false);
  });
});

describe("submitInteraction", () => {
  test("POSTs and returns the interaction id", async () => {
    const calls = queueFetch([() => jsonResponse({ id: "i_abc" })]);

    const result = await submitInteraction({
      apiKey: "k",
      agent: "deep-research-preview-04-2026",
      query: "hello",
    });

    expect(result.interactionId).toBe("i_abc");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toMatch(/\/v1beta\/interactions$/);
  });

  test("throws on non-2xx with response body", async () => {
    queueFetch([() => new Response("forbidden: bad key", { status: 403 })]);
    await expect(
      submitInteraction({ apiKey: "k", agent: "a", query: "q" }),
    ).rejects.toThrow(/403.*forbidden/);
  });

  test("throws when response is missing id", async () => {
    queueFetch([() => jsonResponse({})]);
    await expect(
      submitInteraction({ apiKey: "k", agent: "a", query: "q" }),
    ).rejects.toThrow(/missing id/);
  });
});

describe("pollInteraction", () => {
  test("polls until completed and returns final text + citations + usage", async () => {
    const progress: string[] = [];
    queueFetch([
      () =>
        jsonResponse({
          status: "in_progress",
          outputs: [{ type: "thought_summary", text: "Researching…" }],
        }),
      () =>
        jsonResponse({
          status: "completed",
          outputs: [
            { type: "thought_summary", text: "Researching…" },
            {
              type: "text",
              text: "The answer is 42.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://example.com",
                  title: "Example",
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
    ]);

    const result = await pollInteraction({
      apiKey: "k",
      interactionId: "i_1",
      pollIntervalMs: 0,
      onProgress: (t) => progress.push(t),
    });

    expect(result.text).toBe("The answer is 42.");
    expect(result.citations).toEqual([
      { url: "https://example.com", title: "Example" },
    ]);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(progress.at(-1)).toContain("The answer is 42.");
    expect(progress.at(-1)).toContain("Researching");
  });

  test("throws on failed status with error message", async () => {
    queueFetch([
      () => jsonResponse({ status: "failed", error: "model overloaded" }),
    ]);

    await expect(
      pollInteraction({
        apiKey: "k",
        interactionId: "i_2",
        pollIntervalMs: 0,
      }),
    ).rejects.toThrow(/model overloaded/);
  });

  test("throws on cancelled status", async () => {
    queueFetch([() => jsonResponse({ status: "cancelled" })]);
    await expect(
      pollInteraction({
        apiKey: "k",
        interactionId: "i_3",
        pollIntervalMs: 0,
      }),
    ).rejects.toThrow(/cancelled/);
  });

  test("dedupes citations across outputs by url", async () => {
    queueFetch([
      () =>
        jsonResponse({
          status: "completed",
          outputs: [
            {
              type: "text",
              text: "a",
              annotations: [
                { type: "url_citation", url: "https://x", title: "X" },
              ],
            },
            {
              type: "text",
              text: "b",
              annotations: [
                { type: "url_citation", url: "https://x", title: "X dup" },
                { type: "url_citation", url: "https://y", title: "Y" },
              ],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
    ]);

    const result = await pollInteraction({
      apiKey: "k",
      interactionId: "i_4",
      pollIntervalMs: 0,
    });

    expect(result.citations.map((c) => c.url)).toEqual([
      "https://x",
      "https://y",
    ]);
  });

  test("aborts before issuing a poll when signal is already aborted", async () => {
    const calls = queueFetch([]);
    const ac = new AbortController();
    ac.abort();
    await expect(
      pollInteraction({
        apiKey: "k",
        interactionId: "i_5",
        abortSignal: ac.signal,
        pollIntervalMs: 0,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(0);
  });

  test("URL-encodes the interaction id", async () => {
    const calls = queueFetch([
      () => jsonResponse({ status: "completed", outputs: [] }),
    ]);
    await pollInteraction({
      apiKey: "k",
      interactionId: "interactions/i_with/slash",
      pollIntervalMs: 0,
    });
    expect(calls[0]?.url).toContain(
      encodeURIComponent("interactions/i_with/slash"),
    );
  });
});
