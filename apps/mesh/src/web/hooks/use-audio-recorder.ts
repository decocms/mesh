import { useRef, useState } from "react";

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPending: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  error: Error | null;
  clearError: () => void;
}

interface UseAudioRecorderOptions {
  maxDuration?: number;
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
  return "";
}

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
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  const startRecording = async () => {
    setError(null);
    chunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(new Error("Seu navegador não suporta gravação de áudio"));
      return;
    }

    try {
      setIsPending(true);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const selectedMimeType = mimeType || getSupportedMimeType();
      const recorderOptions: MediaRecorderOptions = selectedMimeType
        ? { mimeType: selectedMimeType }
        : {};

      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

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

      recorder.start(1000);
      setIsRecording(true);
      setIsPending(false);

      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, maxDuration);
    } catch (err) {
      setIsPending(false);
      cleanup();

      if (err instanceof DOMException) {
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
