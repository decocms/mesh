import { useRef, useState } from "react";

export interface UseAudioRecorderReturn {
  /** Whether the recorder is currently recording */
  isRecording: boolean;
  /** Whether we're waiting for permission */
  isPending: boolean;
  /** Start recording audio from the microphone */
  startRecording: () => Promise<void>;
  /** Stop recording and return the audio blob */
  stopRecording: () => Promise<Blob | null>;
  /** Any error that occurred during recording */
  error: Error | null;
  /** Clear the current error */
  clearError: () => void;
}

interface UseAudioRecorderOptions {
  /** Maximum recording duration in milliseconds (default: 5 minutes) */
  maxDuration?: number;
  /** Audio MIME type (default: audio/webm;codecs=opus) */
  mimeType?: string;
}

const DEFAULT_MAX_DURATION = 5 * 60 * 1000; // 5 minutes
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function getSupportedMimeType(): string {
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  // Fallback - let browser decide
  return "";
}

/**
 * Hook for recording audio from the user's microphone.
 * Uses the MediaRecorder API to capture audio as a Blob.
 *
 * @example
 * ```tsx
 * const { isRecording, startRecording, stopRecording } = useAudioRecorder();
 *
 * const handleClick = async () => {
 *   if (isRecording) {
 *     const blob = await stopRecording();
 *     // Do something with the audio blob
 *   } else {
 *     await startRecording();
 *   }
 * };
 * ```
 */
export function useAudioRecorder(
  options: UseAudioRecorderOptions = {},
): UseAudioRecorderReturn {
  const { maxDuration = DEFAULT_MAX_DURATION, mimeType } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);

  const cleanup = () => {
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  const startRecording = async () => {
    console.log("[useAudioRecorder] Starting recording...");

    // Reset state
    setError(null);
    chunksRef.current = [];

    // Check if MediaRecorder is supported
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error("[useAudioRecorder] getUserMedia not supported");
      setError(new Error("Seu navegador não suporta gravação de áudio"));
      return;
    }

    try {
      setIsPending(true);
      console.log("[useAudioRecorder] Requesting microphone access...");

      // Check current permission status first
      try {
        const permissionStatus = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        console.log(
          "[useAudioRecorder] Permission status:",
          permissionStatus.state,
        );
      } catch (permErr) {
        console.log("[useAudioRecorder] Could not query permission status");
      }

      // Request microphone access
      console.log("[useAudioRecorder] Calling getUserMedia...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true, // Simplified - let browser choose settings
      });

      console.log(
        "[useAudioRecorder] Microphone access granted, stream:",
        stream,
      );

      streamRef.current = stream;

      // Create MediaRecorder with supported MIME type
      const selectedMimeType = mimeType || getSupportedMimeType();
      const recorderOptions: MediaRecorderOptions = selectedMimeType
        ? { mimeType: selectedMimeType }
        : {};

      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      // Collect audio chunks
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        if (resolveStopRef.current) {
          resolveStopRef.current(blob);
          resolveStopRef.current = null;
        }

        cleanup();
        setIsRecording(false);
      };

      // Handle errors
      recorder.onerror = (event) => {
        const recorderError = event as ErrorEvent;
        setError(new Error(recorderError.message || "Erro na gravação"));
        cleanup();
        setIsRecording(false);

        if (resolveStopRef.current) {
          resolveStopRef.current(null);
          resolveStopRef.current = null;
        }
      };

      // Start recording
      recorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPending(false);
      console.log("[useAudioRecorder] Recording started!");

      // Set max duration timeout
      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, maxDuration);
    } catch (err) {
      console.error("[useAudioRecorder] Error:", err);
      setIsPending(false);
      cleanup();

      if (err instanceof DOMException) {
        console.error(
          "[useAudioRecorder] DOMException:",
          err.name,
          err.message,
        );
        if (err.name === "NotAllowedError") {
          setError(new Error("Permissão para acessar o microfone foi negada"));
        } else if (err.name === "NotFoundError") {
          setError(new Error("Nenhum microfone encontrado"));
        } else {
          setError(new Error(`Erro ao acessar microfone: ${err.message}`));
        }
      } else {
        setError(err instanceof Error ? err : new Error("Erro desconhecido"));
      }
    }
  };

  const stopRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      resolveStopRef.current = resolve;

      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      } else {
        resolve(null);
        cleanup();
        setIsRecording(false);
      }
    });
  };

  const clearError = () => setError(null);

  return {
    isRecording,
    isPending,
    startRecording,
    stopRecording,
    error,
    clearError,
  };
}
