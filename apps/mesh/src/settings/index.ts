/**
 * Settings accessor for MCP Mesh.
 *
 * getSettings() returns the frozen Settings object constructed by the
 * startup pipeline. Throws if called before buildSettings() completes.
 */

import type { Settings } from "./types";

let _settings: Settings | null = null;

export function setGlobalSettings(s: Settings): void {
  _settings = Object.freeze(s);
}

export function getSettings(): Settings {
  if (!_settings) {
    throw new Error(
      "Settings not initialized — buildSettings() must complete before getSettings() is called",
    );
  }
  return _settings;
}

export type {
  Settings,
  CliFlags,
  ServiceInputs,
  ServiceOutputs,
} from "./types";
