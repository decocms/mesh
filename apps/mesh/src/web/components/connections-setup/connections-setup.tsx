import { useState } from "react";
import { SlotCard } from "./slot-card";
import type { ConnectionSlot } from "./use-slot-resolution";

export interface ConnectionsSetupProps {
  slots: Record<string, ConnectionSlot>;
  onComplete: (connections: Record<string, string>) => void;
}

export function ConnectionsSetup({ slots, onComplete }: ConnectionsSetupProps) {
  const [completed, setCompleted] = useState<Record<string, string>>({});

  const handleSlotComplete = (slotId: string, connectionId: string) => {
    const next = { ...completed };
    if (connectionId === "") {
      delete next[slotId];
    } else {
      next[slotId] = connectionId;
    }
    setCompleted(next);

    const allDone = Object.keys(slots).every((id) => next[id]);
    if (allDone) {
      onComplete(next);
    }
  };

  return (
    <div className="space-y-3">
      {Object.entries(slots).map(([slotId, slot]) => (
        <SlotCard
          key={slotId}
          slot={slot}
          onComplete={(connectionId) =>
            handleSlotComplete(slotId, connectionId)
          }
        />
      ))}
    </div>
  );
}
