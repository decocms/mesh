import { z } from "zod";
import { bindingClient, type ToolBinder } from "../core/binder";

export const SUPPORTED_AUDIO_FORMATS = [
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "video/webm",
] as const;

export const TranscriptionInputSchema = z.object({
  audio: z.string().optional().describe("Base64-encoded audio data"),
  audioUrl: z
    .string()
    .url()
    .optional()
    .describe("URL pointing to the audio file"),
  mimeType: z
    .string()
    .optional()
    .describe("MIME type of the audio file (e.g., audio/webm, audio/mp3)"),
  language: z
    .string()
    .optional()
    .describe(
      "Language hint for transcription (ISO 639-1 code, e.g., en, pt, es)",
    ),
  prompt: z
    .string()
    .optional()
    .describe("Optional prompt to guide the transcription with context"),
  includeTimestamps: z
    .boolean()
    .optional()
    .describe("Whether to include word-level timestamps"),
  includeSpeakerLabels: z
    .boolean()
    .optional()
    .describe("Whether to identify and label different speakers"),
});

export type TranscriptionInput = z.infer<typeof TranscriptionInputSchema>;

export const TranscriptionWordSchema = z.object({
  word: z.string().describe("The transcribed word"),
  start: z.number().optional().describe("Start time in seconds"),
  end: z.number().optional().describe("End time in seconds"),
  confidence: z.number().optional().describe("Confidence score (0-1)"),
  speaker: z
    .string()
    .optional()
    .describe("Speaker label if diarization enabled"),
});

export type TranscriptionWord = z.infer<typeof TranscriptionWordSchema>;

export const TranscriptionSegmentSchema = z.object({
  text: z.string().describe("Transcribed text for this segment"),
  start: z.number().optional().describe("Start time in seconds"),
  end: z.number().optional().describe("End time in seconds"),
  speaker: z
    .string()
    .optional()
    .describe("Speaker label if diarization enabled"),
  words: z
    .array(TranscriptionWordSchema)
    .optional()
    .describe("Word-level details"),
});

export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>;

export const TranscriptionOutputSchema = z.object({
  text: z.string().describe("The full transcribed text"),
  language: z
    .string()
    .optional()
    .describe("Detected or confirmed language (ISO 639-1 code)"),
  duration: z.number().optional().describe("Duration of the audio in seconds"),
  segments: z
    .array(TranscriptionSegmentSchema)
    .optional()
    .describe("Segments with timestamps and optional speaker labels"),
  confidence: z.number().optional().describe("Overall confidence score (0-1)"),
  providerMetadata: z
    .any()
    .optional()
    .describe("Additional provider-specific metadata"),
});

export type TranscriptionOutput = z.infer<typeof TranscriptionOutputSchema>;

export const TRANSCRIPTION_BINDING = [
  {
    name: "TRANSCRIBE_AUDIO" as const,
    inputSchema: TranscriptionInputSchema,
    outputSchema: TranscriptionOutputSchema,
  },
] satisfies ToolBinder[];

export const TranscriptionBinding = bindingClient(TRANSCRIPTION_BINDING);
