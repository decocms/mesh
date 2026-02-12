import { describe, expect, test } from "bun:test";
import { subSeconds } from "date-fns";
import { formatTimeAgo } from "./format-time";

describe("formatTimeAgo", () => {
  test("returns <1m for dates less than 60 seconds ago", () => {
    const now = new Date();
    expect(formatTimeAgo(subSeconds(now, 0))).toBe("<1m");
    expect(formatTimeAgo(subSeconds(now, 30))).toBe("<1m");
    expect(formatTimeAgo(subSeconds(now, 59))).toBe("<1m");
  });

  test("returns Xm ago for minutes", () => {
    const now = new Date();
    expect(formatTimeAgo(subSeconds(now, 60))).toBe("1m ago");
    expect(formatTimeAgo(subSeconds(now, 90))).toBe("1m ago");
    expect(formatTimeAgo(subSeconds(now, 120))).toBe("2m ago");
    expect(formatTimeAgo(subSeconds(now, 3540))).toBe("59m ago");
  });

  test("returns Xh ago for hours", () => {
    const now = new Date();
    expect(formatTimeAgo(subSeconds(now, 3600))).toBe("1h ago");
    expect(formatTimeAgo(subSeconds(now, 7200))).toBe("2h ago");
    expect(formatTimeAgo(subSeconds(now, 86399))).toBe("23h ago");
  });

  test("returns Xd ago for days", () => {
    const now = new Date();
    expect(formatTimeAgo(subSeconds(now, 86400))).toBe("1d ago");
    expect(formatTimeAgo(subSeconds(now, 172800))).toBe("2d ago");
    expect(formatTimeAgo(subSeconds(now, 604799))).toBe("6d ago");
  });

  test("returns Xw ago for weeks", () => {
    const now = new Date();
    expect(formatTimeAgo(subSeconds(now, 604800))).toBe("1w ago");
    expect(formatTimeAgo(subSeconds(now, 2591999))).toBe("4w ago");
  });

  test("returns Xmo ago for months", () => {
    const now = new Date();
    expect(formatTimeAgo(subSeconds(now, 2592000))).toBe("1mo ago");
    expect(formatTimeAgo(subSeconds(now, 31535999))).toBe("12mo ago");
  });

  test("returns Xy ago for years", () => {
    const now = new Date();
    expect(formatTimeAgo(subSeconds(now, 31536000))).toBe("1y ago");
    expect(formatTimeAgo(subSeconds(now, 63072000))).toBe("2y ago");
  });
});
