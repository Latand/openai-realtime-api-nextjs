export type SmartTranscriptionStatus = 'idle' | 'listening' | 'recording' | 'processing';

export interface VADConfig {
  speechThreshold: number;
  silenceThreshold: number;
  pauseDuration: number;
  minRecordingDuration: number;
}

export interface TranscriptionChunk {
  id: string;
  text: string;
  timestamp: number;
  duration: number;
}

export interface SmartTranscriptionState {
  status: SmartTranscriptionStatus;
  transcription: string;
  chunks: TranscriptionChunk[];
  currentRMS: number;
  error: string | null;
}

export interface UseSmartTranscriptionOptions {
  pauseDuration?: number;
  speechThreshold?: number;
  silenceThreshold?: number;
  deviceId?: string;
  onTranscriptionComplete?: (text: string) => void;
}

export interface UseSmartTranscriptionReturn {
  state: SmartTranscriptionState;
  isActive: boolean;
  toggle: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<string>;
  clear: () => void;
}

