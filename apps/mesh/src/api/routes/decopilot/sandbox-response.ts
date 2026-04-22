/**
 * Shared response type for the thread-sandbox endpoint.
 *
 * Consumed by the server handler in ./routes.ts and by the frontend at
 * apps/mesh/src/web/components/vm/{preview,env}/*. The discriminated union
 * forces the UI to exhaustively switch on `sandbox.kind` so a Docker URL
 * can never silently leak into the Freestyle path (or vice versa) — the
 * bug mode where a stale activeVms entry was served as a dead docker URL
 * after boot sweep is structurally unreachable with this shape.
 */
export type SandboxRuntime =
  | {
      kind: "docker";
      previewUrl: string;
      handle: string;
      serverUp: boolean;
      phase: string | null;
    }
  | {
      kind: "freestyle";
      previewUrl: string;
      vmId: string;
      terminalUrl: string | null;
    };

export type ThreadSandboxResponse = {
  sandbox: SandboxRuntime | null;
  thread: {
    exists: boolean;
    sandboxRef: string | null;
  };
};
