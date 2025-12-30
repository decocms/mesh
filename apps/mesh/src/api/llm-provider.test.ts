import { describe, expect, test } from "bun:test";
import type { LanguageModelV2StreamPart } from "@ai-sdk/provider";

// We purposely import the module (not individual symbols) so the test remains
// resilient if exports change. responseToStream is file-local, so we test via
// the public behavior: createLLMProvider().languageModel().doStream() would
// require a full binding; instead we re-implement a minimal copy of the
// stream parsing by instantiating the same TransformStream pipeline.
//
// To keep this lightweight, we directly import the file and access the private
// function through evaluation via dynamic import side effects is not possible.
// So we test the parser behavior by constructing a Response and calling the
// internal `responseToStream` via a re-export in a test-only module pattern.
//
// NOTE: This file is intentionally minimal; it guards against regressions where
// the parser throws on SSE `data:` lines.

import { __testOnly_responseToStream as responseToStream } from "./llm-provider";

function responseFromText(text: string, contentType: string): Response {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
    },
  });
}

async function collect(stream: ReadableStream<LanguageModelV2StreamPart>) {
  const reader = stream.getReader();
  const parts: LanguageModelV2StreamPart[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

describe("llm-provider stream parsing", () => {
  test("parses NDJSON stream parts", async () => {
    const input =
      JSON.stringify({ type: "text-start", id: "gen-1" }) +
      "\n" +
      JSON.stringify({ type: "text-delta", id: "gen-1", delta: "hi" }) +
      "\n";

    const res = responseFromText(input, "application/x-ndjson");
    const parts = await collect(responseToStream(res));

    expect(parts.length).toBe(2);
    expect(parts[0]).toEqual({ type: "text-start", id: "gen-1" });
    expect(parts[1]).toEqual({ type: "text-delta", id: "gen-1", delta: "hi" });
  });

  test("parses SSE data: lines containing JSON", async () => {
    const input =
      "event: message\n" +
      'data: {"type":"text-start","id":"gen-2"}\n' +
      'data: {"type":"text-delta","id":"gen-2","delta":"yo"}\n' +
      "data: [DONE]\n";

    const res = responseFromText(input, "text/event-stream");
    const parts = await collect(responseToStream(res));

    expect(parts.length).toBe(2);
    expect(parts[0]).toEqual({ type: "text-start", id: "gen-2" });
    expect(parts[1]).toEqual({ type: "text-delta", id: "gen-2", delta: "yo" });
  });
});
