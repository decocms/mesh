/**
 * Exec children — scripts launched via POST /_decopilot_vm/exec/<name>.
 * Keyed by script name (not pid) because that's what the UI broadcasts in
 * the `processes` SSE event and what /kill/<name> looks up.
 *
 * Separate from `dev` state by design: /dev/* owns the single long-running
 * dev server + phase machine; exec is for one-offs (build, test, lint) that
 * share the workdir and log ring but have their own lifecycle.
 */

/** name -> ChildProcess. Live set; entries are removed on exit/error. */
export const execChildren = new Map();
