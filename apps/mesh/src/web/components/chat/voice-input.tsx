import { cn } from "@deco/ui/lib/utils.ts";
import { Check, X } from "@untitledui/icons";

// ============================================================================
// VoiceWaveform - Animated waveform visualization
// ============================================================================

interface VoiceWaveformProps {
  data: number[];
}

function VoiceWaveform({ data }: VoiceWaveformProps) {
  return (
    <div
      className="flex items-center justify-center gap-[2px] flex-1 h-7 overflow-hidden"
      aria-hidden="true"
    >
      {data.map((amp, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static bars
          key={i}
          className="w-[2px] shrink-0 rounded-full bg-foreground/60 transition-[height] duration-75 ease-out"
          style={{ height: `${Math.max(3, Math.round(amp * 28))}px` }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// VoiceInputOverlay - Recording UI shown inside the chat form
// ============================================================================

export interface VoiceInputOverlayProps {
  waveformData: number[];
  transcript: string;
  interimTranscript: string;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}

export function VoiceInputOverlay({
  waveformData,
  transcript,
  interimTranscript,
  onCancel,
  onConfirm,
  className,
}: VoiceInputOverlayProps) {
  const displayText =
    transcript + (interimTranscript ? " " + interimTranscript : "");
  const hasText = displayText.trim().length > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 w-full min-h-[52px]",
        className,
      )}
    >
      {/* Waveform or transcript text */}
      <div className="flex items-center flex-1 min-w-0 overflow-hidden">
        {hasText ? (
          <p className="text-sm text-foreground/80 truncate leading-relaxed">
            <span>{transcript}</span>
            {interimTranscript && (
              <span className="text-muted-foreground">
                {" "}
                {interimTranscript}
              </span>
            )}
          </p>
        ) : (
          <VoiceWaveform data={waveformData} />
        )}
      </div>

      {/* Cancel button */}
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 flex items-center justify-center size-7 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Cancel recording"
      >
        <X size={15} />
      </button>

      {/* Confirm button */}
      <button
        type="button"
        onClick={onConfirm}
        className="shrink-0 flex items-center justify-center size-7 rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
        aria-label="Use transcription"
      >
        <Check size={15} />
      </button>
    </div>
  );
}
