/**
 * Transcription Well-Known Binding
 *
 * Defines the interface for audio transcription providers.
 * Any MCP that implements this binding can provide audio-to-text transcription.
 *
 * This binding includes:
 * - TRANSCRIPTION_TRANSCRIBE: Transcribe audio to text
 *
 * Similar to the LANGUAGE_MODEL_BINDING pattern, this allows the Mesh
 * to use any transcription provider (OpenAI Whisper, Google Speech-to-Text,
 * Deepgram, AssemblyAI, etc.) through a unified interface.
 */

import { z } from "zod";
import { bindingClient, type ToolBinder } from "../core/binder";

/**
 * Supported audio formats for transcription.
 * Most transcription APIs support these common formats.
 */
export const SUPPORTED_AUDIO_FORMATS = [
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "video/webm", // MediaRecorder sometimes reports audio as video/webm
] as const;

/**
 * Transcription Input Schema
 *
 * Input for the transcription tool.
 * Audio can be provided as base64-encoded data or as a URL.
 */
export const TranscriptionInputSchema = z.object({
  /**
   * Audio data as base64-encoded string.
   * Either `audio` or `audioUrl` must be provided.
   */
  audio: z.string().optional().describe("Base64-encoded audio data"),

  /**
   * URL pointing to the audio file.
   * Either `audio` or `audioUrl` must be provided.
   */
  audioUrl: z
    .string()
    .url()
    .optional()
    .describe("URL pointing to the audio file"),

  /**
   * MIME type of the audio (e.g., "audio/webm", "audio/mp3").
   * Helps the transcription service handle the audio correctly.
   */
  mimeType: z
    .string()
    .optional()
    .describe("MIME type of the audio file (e.g., audio/webm, audio/mp3)"),

  /**
   * Language hint for transcription (ISO 639-1 code, e.g., "en", "pt", "es").
   * If not provided, the service will attempt to auto-detect.
   */
  language: z
    .string()
    .optional()
    .describe(
      "Language hint for transcription (ISO 639-1 code, e.g., en, pt, es)",
    ),

  /**
   * Optional prompt to guide the transcription.
   * Useful for providing context about expected vocabulary or format.
   */
  prompt: z
    .string()
    .optional()
    .describe("Optional prompt to guide the transcription with context"),

  /**
   * Whether to include word-level timestamps in the response.
   */
  includeTimestamps: z
    .boolean()
    .optional()
    .describe("Whether to include word-level timestamps"),

  /**
   * Whether to include speaker diarization (identifying different speakers).
   */
  includeSpeakerLabels: z
    .boolean()
    .optional()
    .describe("Whether to identify and label different speakers"),
});

export type TranscriptionInput = z.infer<typeof TranscriptionInputSchema>;

/**
 * Word with timestamp for detailed transcription output
 */
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

/**
 * Segment of transcription (usually a sentence or phrase)
 */
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

/**
 * Transcription Output Schema
 *
 * Output from the transcription tool.
 */
export const TranscriptionOutputSchema = z.object({
  /**
   * The full transcribed text.
   */
  text: z.string().describe("The full transcribed text"),

  /**
   * Detected or confirmed language (ISO 639-1 code).
   */
  language: z
    .string()
    .optional()
    .describe("Detected or confirmed language (ISO 639-1 code)"),

  /**
   * Duration of the audio in seconds.
   */
  duration: z.number().optional().describe("Duration of the audio in seconds"),

  /**
   * Segments with timestamps (if requested and supported).
   */
  segments: z
    .array(TranscriptionSegmentSchema)
    .optional()
    .describe("Segments with timestamps and optional speaker labels"),

  /**
   * Overall confidence score (0-1) if available.
   */
  confidence: z.number().optional().describe("Overall confidence score (0-1)"),

  /**
   * Provider-specific metadata.
   */
  providerMetadata: z
    .any()
    .optional()
    .describe("Additional provider-specific metadata"),
});

export type TranscriptionOutput = z.infer<typeof TranscriptionOutputSchema>;

/**
 * Transcription Binding
 *
 * Defines the interface for audio transcription providers.
 * Any MCP that implements this binding can provide transcription services.
 *
 * Required tools:
 * - TRANSCRIBE_AUDIO: Transcribe audio to text
 */
export const TRANSCRIPTION_BINDING = [
  {
    name: "TRANSCRIBE_AUDIO" as const,
    inputSchema: TranscriptionInputSchema,
    outputSchema: TranscriptionOutputSchema,
  },
] satisfies ToolBinder[];

export const TranscriptionBinding = bindingClient(TRANSCRIPTION_BINDING);
