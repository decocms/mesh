/**
 * Audio Recorder Hook
 *
 * Provides audio recording functionality using the MediaRecorder API.
 * Handles permission requests, recording state, and blob generation.
 */

import { useRef, useState } from "react";

export interface UseAudioRecorderReturn {
  /** Whether recording is currently in progress */
  isRecording: boolean;
  /** Whether the recorder is initializing (getting permissions) */
  isPending: boolean;
  /** Start recording audio */
  startRecording: () => Promise<void>;
  /** Stop recording and return the audio blob */
  stopRecording: () => Promise<Blob | null>;
  /** Current error, if any */
  error: Error | null;
  /** Clear the current error */
  clearError: () => void;
}

export interface UseAudioRecorderOptions {
  /** Maximum recording duration in milliseconds (default: 5 minutes) */
  maxDuration?: number;
  /** Preferred MIME type for recording */
  mimeType?: string;
}

/**
 * Preferred MIME types in order of preference
 * These are commonly supported across browsers
 */
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/**
 * Get the best supported MIME type for recording
 */
function getSupportedMimeType(preferredType?: string): string {
  // Check preferred type first
  if (preferredType && MediaRecorder.isTypeSupported(preferredType)) {
    return preferredType;
  }

  // Find first supported type from our list
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  // Fallback to empty string (browser default)
  return "";
}

/**
 * Hook for recording audio using the MediaRecorder API
 *
 * @param options - Recording options
 * @returns Recording state and control functions
 *
 * @example
 * ```tsx
 * const { isRecording, startRecording, stopRecording, error } = useAudioRecorder();
 *
 * const handleToggle = async () => {
 *   if (isRecording) {
 *     const blob = await stopRecording();
 *     if (blob) {
 *       // Do something with the audio blob
 *     }
 *   } else {
 *     await startRecording();
 *   }
 * };
 * ```
 */
export function useAudioRecorder(
  options: UseAudioRecorderOptions = {},
): UseAudioRecorderReturn {
  const { maxDuration = 5 * 60 * 1000, mimeType: preferredMimeType } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);

  const clearError = () => setError(null);

  /**
   * Cleanup all resources
   */
  const cleanup = () => {
    // Clear timeout
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Stop all tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Clear recorder reference
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  /**
   * Start recording audio
   */
  const startRecording = async (): Promise<void> => {
    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(new Error("Audio recording is not supported in this browser"));
      return;
    }

    if (!window.MediaRecorder) {
      setError(new Error("MediaRecorder API is not supported in this browser"));
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      mediaStreamRef.current = stream;

      // Get supported MIME type
      const mimeType = getSupportedMimeType(preferredMimeType);

      // Create MediaRecorder
      const recorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
      });

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      // Handle data available
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

        // Resolve the stop promise with the blob
        if (resolveStopRef.current) {
          resolveStopRef.current(blob);
          resolveStopRef.current = null;
        }

        cleanup();
        setIsRecording(false);
      };

      // Handle errors
      recorder.onerror = (event) => {
        console.error("[useAudioRecorder] Recording error:", event);
        setError(new Error("Recording failed"));

        if (resolveStopRef.current) {
          resolveStopRef.current(null);
          resolveStopRef.current = null;
        }

        cleanup();
        setIsRecording(false);
      };

      // Start recording
      recorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPending(false);

      // Set maximum duration timeout
      timeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, maxDuration);
    } catch (err) {
      cleanup();
      setIsPending(false);

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setError(
            new Error(
              "Microphone access denied. Please allow microphone access and try again.",
            ),
          );
        } else if (err.name === "NotFoundError") {
          setError(
            new Error(
              "No microphone found. Please connect a microphone and try again.",
            ),
          );
        } else {
          setError(new Error(`Failed to access microphone: ${err.message}`));
        }
      } else {
        setError(
          err instanceof Error ? err : new Error("Failed to start recording"),
        );
      }
    }
  };

  /**
   * Stop recording and return the audio blob
   */
  const stopRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Check recorder's actual state instead of React state to avoid stale closures
      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state !== "recording"
      ) {
        resolve(null);
        return;
      }

      // Store resolve function to be called in onstop handler
      resolveStopRef.current = resolve;

      // Stop the recorder
      mediaRecorderRef.current.stop();
    });
  };

  return {
    isRecording,
    isPending,
    startRecording,
    stopRecording,
    error,
    clearError,
  };
}
