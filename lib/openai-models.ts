export const OPENAI_REALTIME_VOICE_MODEL = "gpt-realtime-2";
export const OPENAI_REALTIME_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";
export const OPENAI_FILE_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

export const REALTIME_VOICE_TURN_DETECTION = {
  type: "server_vad",
  threshold: 0.65,
  prefix_padding_ms: 500,
  silence_duration_ms: 1200,
} as const;

export const REALTIME_TRANSCRIPTION_TURN_DETECTION = {
  type: "server_vad",
  threshold: 0.48,
  prefix_padding_ms: 500,
  silence_duration_ms: 650,
} as const;

export const REALTIME_TRANSCRIPTION_PROMPT = [
  "Transcribe the user's speech exactly.",
  "Preserve the spoken language; do not translate.",
  "Preserve Ukrainian, English, Russian, names, code terms, URLs, file paths, and numbers accurately.",
  "Do not add filler, captions, sign-offs, or inferred content that was not spoken.",
].join(" ");

export const REALTIME_2_INSTRUCTION_APPENDIX = `

# Realtime Voice Behavior
- For direct answers, respond quickly without a spoken preamble.
- Use a short spoken preamble only before a tool call or longer multi-step task.
- Preserve exact entities such as names, numbers, URLs, file paths, and commands.
- Ask for confirmation before irreversible actions or when a high-precision detail is unclear.
`;
