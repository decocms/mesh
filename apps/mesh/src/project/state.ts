/**
 * Project State
 *
 * Module-level holder for the project scan result.
 * Set once during bootstrap, read by API routes.
 */

import type { ProjectScanResult } from "./scanner";

let _scanResult: ProjectScanResult | null = null;

export function setScanResult(result: ProjectScanResult): void {
  _scanResult = result;
}

export function getScanResult(): ProjectScanResult | null {
  return _scanResult;
}
