import UnicornScene from "unicornstudio-react";
import { cn } from "@deco/ui/lib/utils.ts";

const PROJECT_ID = "3u9H2SGWSifD8DQZHG4X";
const SDK_URL = "/vendor/unicornstudio.umd.js";

interface DecoSceneProps {
  className?: string;
}

export function DecoScene({ className }: DecoSceneProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      <div className="w-[640px] h-[480px] max-w-full max-h-full">
        <UnicornScene
          projectId={PROJECT_ID}
          sdkUrl={SDK_URL}
          width="100%"
          height="100%"
        />
      </div>
    </div>
  );
}
