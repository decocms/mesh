/**
 * Embeds the prebuilt sandbox CLI bundle as a string at build time.
 *
 * Mirrors daemon-asset.ts — isolated so `host/runner.ts` can `await import()`
 * it lazily and tests using the `_spawn` seam don't require
 * `cli/dist/sandbox.js` to exist on disk.
 *
 * In production (bundled `server.js`), `bun build` inlines the CLI bytes here
 * so no asset has to ship alongside the bundle. The host runner writes these
 * bytes to disk on first spawn and points `bun run` at the materialized file.
 */

// @ts-ignore - Bun-specific text loader attribute; TS doesn't model `with { type: "text" }`.
import _cliBundle from "../../../cli/dist/sandbox.js" with { type: "text" };

export const CLI_BUNDLE: string = _cliBundle as unknown as string;
