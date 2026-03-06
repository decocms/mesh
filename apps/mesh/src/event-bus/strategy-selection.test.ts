import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import type { MeshDatabase } from "../database";
import type { Kysely } from "kysely";
import { createEventBus } from "./index";

const fakeDb = {} as Kysely<any>;

function makeSqliteDb(): MeshDatabase {
  return { type: "sqlite", db: fakeDb };
}

function makePostgresDb(): MeshDatabase {
  return { type: "postgres", db: fakeDb, pool: {} as any };
}

function makePGliteDb(): MeshDatabase {
  return { type: "pglite", db: fakeDb };
}

describe("resolveNotifyStrategy", () => {
  const savedNotifyStrategy = process.env.NOTIFY_STRATEGY;
  const savedNatsUrl = process.env.NATS_URL;

  beforeEach(() => {
    delete process.env.NOTIFY_STRATEGY;
    delete process.env.NATS_URL;
  });

  afterEach(() => {
    if (savedNotifyStrategy !== undefined) {
      process.env.NOTIFY_STRATEGY = savedNotifyStrategy;
    } else {
      delete process.env.NOTIFY_STRATEGY;
    }
    if (savedNatsUrl !== undefined) {
      process.env.NATS_URL = savedNatsUrl;
    } else {
      delete process.env.NATS_URL;
    }
  });

  function captureConsole(fn: () => void): string[] {
    const logs: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = (...args: any[]) => logs.push(args.join(" "));
    console.warn = (...args: any[]) => logs.push(args.join(" "));
    try {
      fn();
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
    return logs;
  }

  test("auto-detect: PGlite -> polling (not postgres LISTEN/NOTIFY)", () => {
    const logs = captureConsole(() => {
      createEventBus(makePGliteDb());
    });
    expect(logs.some((l) => l.includes("Using polling notify strategy"))).toBe(
      true,
    );
    expect(logs.some((l) => l.includes("LISTEN/NOTIFY"))).toBe(false);
  });

  test("auto-detect: sqlite -> polling", () => {
    const logs = captureConsole(() => {
      createEventBus(makeSqliteDb());
    });
    expect(logs.some((l) => l.includes("Using polling notify strategy"))).toBe(
      true,
    );
  });

  test("auto-detect: postgres without NATS_URL -> postgres LISTEN/NOTIFY", () => {
    const logs = captureConsole(() => {
      createEventBus(makePostgresDb());
    });
    expect(logs.some((l) => l.includes("LISTEN/NOTIFY"))).toBe(true);
  });

  test("explicit NOTIFY_STRATEGY=polling overrides postgres", () => {
    process.env.NOTIFY_STRATEGY = "polling";
    const logs = captureConsole(() => {
      createEventBus(makePostgresDb());
    });
    expect(logs.some((l) => l.includes("Using polling notify strategy"))).toBe(
      true,
    );
  });

  test("explicit NOTIFY_STRATEGY=postgres with PGlite falls back to polling", () => {
    process.env.NOTIFY_STRATEGY = "postgres";
    const logs = captureConsole(() => {
      createEventBus(makePGliteDb());
    });
    expect(logs.some((l) => l.includes("falling back to polling"))).toBe(true);
  });

  test("explicit NOTIFY_STRATEGY=nats without NATS_URL throws", () => {
    process.env.NOTIFY_STRATEGY = "nats";
    delete process.env.NATS_URL;

    expect(() => createEventBus(makePGliteDb())).toThrow(
      "NOTIFY_STRATEGY=nats requires NATS_URL",
    );
  });
});
