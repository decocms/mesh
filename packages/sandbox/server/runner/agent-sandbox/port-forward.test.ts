/**
 * Unit coverage for the K8s port-forward module. K8s itself is never reached
 * here — these tests exercise the local listener bind/close and the
 * deterministic-port hash. The actual WebSocket-tunnel path runs end-to-end
 * in `runner-bootstrap.test.ts` (with a stubbed `portForwarder` field) and
 * in the live integration suite.
 */

import { afterEach, describe, expect, it } from "bun:test";
import * as net from "node:net";
import type { KubeConfig } from "@kubernetes/client-node";
import {
  K8sPortForwarder,
  deterministicLocalPort,
  type PortForwarder,
} from "./port-forward";

const KC = {
  getCurrentCluster: () => ({
    server: "https://kube.test",
    skipTLSVerify: true,
  }),
  applyToHTTPSOptions: async () => {},
} as unknown as KubeConfig;

describe("deterministicLocalPort", () => {
  it("falls inside the configured port range (40000..49999)", () => {
    for (let i = 0; i < 100; i++) {
      const p = deterministicLocalPort(`handle-${i}`, 9000);
      expect(p).toBeGreaterThanOrEqual(40000);
      expect(p).toBeLessThan(50000);
    }
  });

  it("is stable for the same (handle, containerPort) pair", () => {
    const a = deterministicLocalPort("alpha-aaaaa", 9000);
    const b = deterministicLocalPort("alpha-aaaaa", 9000);
    expect(a).toBe(b);
  });

  it("differs across containerPorts on the same handle", () => {
    const a = deterministicLocalPort("alpha-aaaaa", 9000);
    const b = deterministicLocalPort("alpha-aaaaa", 3000);
    expect(a).not.toBe(b);
  });
});

describe("K8sPortForwarder.open", () => {
  const opened: PortForwarder[] = [];

  afterEach(() => {
    for (const f of opened.splice(0)) {
      try {
        f.server.close();
      } catch {}
    }
  });

  it("binds a 127.0.0.1 listener at the deterministic port", async () => {
    const fwd = new K8sPortForwarder({ kubeConfig: KC, namespace: "ns" });
    const f = await fwd.open("pod-x", 9000, "alpha-bbbbb");
    opened.push(f);
    expect(f.localPort).toBe(deterministicLocalPort("alpha-bbbbb", 9000));
  });

  it("walks forward on EADDRINUSE and binds the next free port", async () => {
    // Pre-bind the deterministic port so the forwarder hits EADDRINUSE on
    // its first attempt and walks forward.
    const expected = deterministicLocalPort("alpha-ccccc", 9000);
    const blocker = await new Promise<net.Server>((resolve, reject) => {
      const s = net.createServer();
      s.once("error", reject);
      s.listen(expected, "127.0.0.1", () => resolve(s));
    });
    try {
      const fwd = new K8sPortForwarder({ kubeConfig: KC, namespace: "ns" });
      const f = await fwd.open("pod-y", 9000, "alpha-ccccc");
      opened.push(f);
      expect(f.localPort).not.toBe(expected);
      expect(f.localPort).toBeGreaterThanOrEqual(40000);
      expect(f.localPort).toBeLessThan(50000);
    } finally {
      await new Promise<void>((r) => blocker.close(() => r()));
    }
  });

  it("close() releases the listener; the same port can be re-bound", async () => {
    const fwd = new K8sPortForwarder({ kubeConfig: KC, namespace: "ns" });
    const f = await fwd.open("pod-z", 9000, "alpha-ddddd");
    const port = f.localPort;
    await new Promise<void>((resolve) => {
      f.server.close(() => resolve());
    });
    // Re-bind: if close() left the listener live, listen() throws EADDRINUSE.
    const rebind = await new Promise<net.Server>((resolve, reject) => {
      const s = net.createServer();
      s.once("error", reject);
      s.listen(port, "127.0.0.1", () => resolve(s));
    });
    await new Promise<void>((r) => rebind.close(() => r()));
  });
});
