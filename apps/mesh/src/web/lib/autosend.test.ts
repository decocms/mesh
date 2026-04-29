import { describe, expect, test } from "bun:test";
import {
  AUTOSEND_TTL_MS,
  decodeAutosend,
  encodeAutosend,
  type AutosendPayload,
} from "./autosend";

describe("autosend encode/decode", () => {
  test("round-trips a simple payload", () => {
    const payload: AutosendPayload = {
      message: { tiptapDoc: { type: "doc", content: [] } },
      createdAt: 1_700_000_000_000,
    };
    const encoded = encodeAutosend(payload);
    expect(typeof encoded).toBe("string");
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("+");
    const decoded = decodeAutosend(encoded);
    expect(decoded).toEqual(payload);
  });

  test("round-trips a payload with non-ASCII text", () => {
    const payload: AutosendPayload = {
      message: {
        tiptapDoc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "olá — café 🚀" }],
            },
          ],
        },
      },
      createdAt: Date.now(),
    };
    const decoded = decodeAutosend(encodeAutosend(payload));
    expect(decoded).toEqual(payload);
  });

  test("returns null for invalid base64", () => {
    expect(decodeAutosend("not!!!base64")).toBeNull();
  });

  test("returns null for valid base64 but invalid JSON", () => {
    const encoded = btoa("not json").replace(/=+$/, "");
    expect(decodeAutosend(encoded)).toBeNull();
  });

  test("returns null when shape is wrong", () => {
    const encoded = btoa(JSON.stringify({ foo: 1 })).replace(/=+$/, "");
    expect(decodeAutosend(encoded)).toBeNull();
  });

  test("AUTOSEND_TTL_MS is 10 seconds", () => {
    expect(AUTOSEND_TTL_MS).toBe(10_000);
  });
});
