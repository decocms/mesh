import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

type SendArgs = Parameters<Transport["send"]>;

/**
 * Compose transports into a single transport.
 * Make sure the output transport is the last one in the array.
 *
 * @example
 * ```ts
 * const transport = composeTransports([transport1, transport2, outboundTransport]);
 * ```
 */
export function composeTransports(transports: Transport[]): Transport {
  if (transports.length === 0) {
    throw new Error("composeTransports requires at least one transport");
  }

  const messageCB: NonNullable<Transport["onmessage"]>[] = [];
  const errorCB: NonNullable<Transport["onerror"]>[] = [];
  const closeCB: NonNullable<Transport["onclose"]>[] = [];

  for (let it = transports.length - 1; it >= 1; it--) {
    const current = transports[it]!;
    const previous = transports[it - 1];
    current.onmessage = (message, extra) => {
      previous?.onmessage?.(message, extra);
    };
    current.onerror = (error) => {
      previous?.onerror?.(error);
    };
    current.onclose = () => {
      previous?.onclose?.();
    };
  }
  const first = transports[0]!;
  first.onmessage = (...args) => messageCB.forEach((cb) => cb(...args));
  first.onerror = (error) => errorCB.forEach((cb) => cb(error));
  first.onclose = () => closeCB.forEach((cb) => cb());

  const composed: Transport = {
    // Return wrapper functions that invoke all registered callbacks
    // This allows the SDK to call these directly (e.g., transport.onerror?.(error))
    onmessage: (...args: Parameters<NonNullable<Transport["onmessage"]>>) =>
      messageCB.forEach((cb) => cb(...args)),
    onerror: (error: Error) => errorCB.forEach((cb) => cb(error)),
    onclose: () => closeCB.forEach((cb) => cb()),
    async start() {
      // from left to right
      for (const transport of transports) {
        await transport.start();
      }
    },
    async close() {
      // from right to left
      for (let i = transports.length - 1; i >= 0; i -= 1) {
        await transports[i]!.close();
      }
    },
    async send(...args: SendArgs) {
      // from left to right
      for (const transport of transports) {
        await transport.send(...args);
      }
    },
  };

  return composed;
}
