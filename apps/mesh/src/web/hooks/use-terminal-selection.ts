import { useState, useEffect } from "react";
import type { Terminal } from "@xterm/xterm";

interface TerminalSelection {
  hasSelection: boolean;
  getSelectedText: () => string;
}

export function useTerminalSelection(
  terminal: Terminal | null,
): TerminalSelection {
  const [hasSelection, setHasSelection] = useState(false);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — xterm.js event subscription lifecycle: subscribe on terminal change, dispose on unmount
  useEffect(() => {
    if (!terminal) {
      setHasSelection(false);
      return;
    }

    const disposable = terminal.onSelectionChange(() => {
      setHasSelection(!!terminal.getSelection());
    });

    return () => disposable.dispose();
  }, [terminal]);

  const getSelectedText = () => terminal?.getSelection() ?? "";

  return { hasSelection, getSelectedText };
}
