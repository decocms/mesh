/**
 * Transcription Well-Known Binding
 *
 * Defines the interface for audio transcription operations.
 * Any MCP that implements this binding can provide audio-to-text
 * transcription capabilities (e.g., OpenAI Whisper, Google Speech-to-Text).
 *
 * This binding includes:
 * - TRANSCRIBE_AUDIO: Transcribe audio to text
 */

import { z } from "zod";
import { bindingClient, type ToolBinder } from "../core/binder";

/**
 * Supported audio formats for transcription
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
  "video/webm",
] as const;

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * TRANSCRIBE_AUDIO Input Schema
 */
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

/**
 * Word-level transcription detail
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
 * Segment-level transcription detail
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
 * TRANSCRIBE_AUDIO Output Schema
 */
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

// ============================================================================
// Binding Definition
// ============================================================================

/**
 * Transcription Binding
 *
 * Defines the interface for audio transcription operations.
 * Any MCP that implements this binding can be used for audio-to-text
 * transcription in the chat interface.
 *
 * Required tools:
 * - TRANSCRIBE_AUDIO: Transcribe audio to text
 */
export const TRANSCRIPTION_BINDING = [
  {
    name: "TRANSCRIBE_AUDIO" as const,
    inputSchema: TranscriptionInputSchema,
    outputSchema: TranscriptionOutputSchema,
  } satisfies ToolBinder<
    "TRANSCRIBE_AUDIO",
    TranscriptionInput,
    TranscriptionOutput
  >,
] as const;

export type TranscriptionBindingType = typeof TRANSCRIPTION_BINDING;

/**
 * Transcription binding client for calling TRANSCRIBE_AUDIO
 */
export const TranscriptionBinding = bindingClient(TRANSCRIPTION_BINDING);
