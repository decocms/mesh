/**
 * Cross-side parity guard for the bootstrap-payload canonicalizer.
 *
 * Daemon (`packages/sandbox/daemon/canonicalize.ts`) and mesh
 * (`packages/sandbox/server/daemon-client.ts:canonicalizeBootstrapPayload`)
 * have separately-implemented stable-sort JSON encoders. They produce
 * equivalent output today; this test catches drift before it becomes a
 * runtime hash mismatch.
 *
 * The two functions are imported from the same `@decocms/sandbox` package
 * (daemon + server share a tsconfig), so direct imports work — no need
 * to fall back to hash equality.
 */
import { describe, expect, it } from "bun:test";
import { canonicalize as daemonCanonicalize } from "../daemon/canonicalize";
import { canonicalizeBootstrapPayload as serverCanonicalize } from "./daemon-client";

interface Case {
  name: string;
  payload: unknown;
}

const cases: Case[] = [
  {
    name: "minimal bootstrap payload",
    payload: {
      schemaVersion: 1,
      runtime: "node",
    },
  },
  {
    name: "shuffled top-level keys",
    payload: {
      runtime: "bun",
      schemaVersion: 1,
    },
  },
  {
    name: "env map with shuffled keys",
    payload: {
      schemaVersion: 1,
      runtime: "node",
      env: { Z_LAST: "z", A_FIRST: "a", M_MID: "m" },
    },
  },
  {
    name: "all optional fields present",
    payload: {
      schemaVersion: 1,
      runtime: "deno",
      cloneUrl: "https://example.com/repo.git",
      repoName: "repo",
      branch: "main",
      gitUserName: "Bot",
      gitUserEmail: "bot@example.com",
      packageManager: "pnpm",
      devPort: 3000,
      env: { FOO: "bar" },
    },
  },
  {
    name: "optional fields absent",
    payload: {
      schemaVersion: 1,
      runtime: "node",
    },
  },
  {
    name: "explicit undefined fields drop out",
    payload: {
      schemaVersion: 1,
      runtime: "node",
      branch: undefined,
      gitUserName: undefined,
      env: { A: "1", B: undefined },
    },
  },
  {
    name: "empty arrays preserved",
    payload: {
      schemaVersion: 1,
      runtime: "node",
      tags: [],
    },
  },
  {
    name: "nested objects sort recursively",
    payload: {
      schemaVersion: 1,
      runtime: "node",
      meta: { z: { c: 3, a: 1, b: 2 }, a: 1 },
    },
  },
  {
    name: "kitchen-sink — mirrors bootstrap.e2e.test.ts basicPayload + extras",
    payload: {
      schemaVersion: 1,
      runtime: "node",
      cloneUrl: "https://github.com/decocms/example.git",
      repoName: "example",
      branch: "feature/x",
      gitUserName: "Mesh Bot",
      gitUserEmail: "bot@deco.cx",
      packageManager: "bun",
      devPort: 3000,
      env: {
        NODE_ENV: "production",
        API_KEY: "secret",
        FEATURE_FLAGS: "a,b,c",
      },
    },
  },
];

describe("canonicalize parity (daemon ↔ server)", () => {
  for (const c of cases) {
    it(`byte-for-byte equal: ${c.name}`, () => {
      const a = daemonCanonicalize(c.payload);
      const b = serverCanonicalize(c.payload);
      expect(b).toBe(a);
    });
  }

  it("shuffled keys produce identical bytes on both sides", () => {
    const ordered = {
      a: 1,
      b: { x: 1, y: 2 },
      c: ["z", "a"],
      env: { K: "v", A: "v" },
    };
    const shuffled = {
      env: { A: "v", K: "v" },
      c: ["z", "a"],
      b: { y: 2, x: 1 },
      a: 1,
    };
    expect(daemonCanonicalize(ordered)).toBe(daemonCanonicalize(shuffled));
    expect(serverCanonicalize(ordered)).toBe(serverCanonicalize(shuffled));
    expect(serverCanonicalize(ordered)).toBe(daemonCanonicalize(shuffled));
  });
});
