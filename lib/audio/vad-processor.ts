import { VADConfig } from "@/types/smart-transcription";

export class VADProcessor {
  audioContext: AudioContext | null = null;
  analyserNode: AnalyserNode | null = null;
  sourceNode: MediaStreamAudioSourceNode | null = null;
  config: VADConfig;

  // State
  isListening: boolean = false;
  isRecording: boolean = false;

  // Timers
  silenceStartTime: number | null = null;
  recordingStartTime: number | null = null;

  // Data
  dataArray: Uint8Array | null = null;
  animationFrameId: number | null = null;

  // Callbacks
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onRmsChange?: (rms: number) => void;

  constructor(config: VADConfig) {
    this.config = config;
  }

  connect(stream: MediaStream) {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048; // Good balance for time domain data
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);

    this.sourceNode.connect(this.analyserNode);

    const bufferLength = this.analyserNode.fftSize;
    this.dataArray = new Uint8Array(bufferLength);
  }

  disconnect() {
    this.stop();
    
    this.sourceNode?.disconnect();
    this.analyserNode?.disconnect();
    this.audioContext?.close();

    this.sourceNode = null;
    this.analyserNode = null;
    this.audioContext = null;
    this.dataArray = null;
  }

  start() {
    this.isListening = true;
    this.isRecording = false;
    this.silenceStartTime = null;
    this.recordingStartTime = null;
    this.processFrame();
  }

  stop() {
    this.isListening = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private calculateRMS(): number {
    if (!this.analyserNode || !this.dataArray) return 0;

    this.analyserNode.getByteTimeDomainData(this.dataArray);

    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      // Convert to -1..1 range
      // 128 is zero
      const normalized = (this.dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }

    return Math.sqrt(sum / this.dataArray.length);
  }

  private processFrame = () => {
    if (!this.isListening) return;

    const rms = this.calculateRMS();
    this.onRmsChange?.(rms);

    const now = Date.now();

    if (!this.isRecording) {
      // Listening state - waiting for speech
      if (rms > this.config.speechThreshold) {
        // console.log("[VAD] Speech detected, starting recording. RMS:", rms);
        this.isRecording = true;
        this.recordingStartTime = now;
        this.silenceStartTime = null;
        this.onSpeechStart?.();
      }
    } else {
      // Recording state - waiting for silence
      if (rms < this.config.silenceThreshold) {
        if (this.silenceStartTime === null) {
          this.silenceStartTime = now;
        } else if (now - this.silenceStartTime > this.config.pauseDuration) {
          // Silence detected for long enough
          const duration = this.recordingStartTime ? now - this.recordingStartTime : 0;

          if (duration > this.config.minRecordingDuration) {
            // console.log("[VAD] Silence detected, stopping recording. Duration:", duration);
            this.isRecording = false;
            this.onSpeechEnd?.();
          } else {
            // Too short, just reset
            // console.log("[VAD] Recording too short, ignoring. Duration:", duration);
            this.isRecording = false;
            // No callback, just go back to listening
          }
          this.silenceStartTime = null;
        }
      } else {
        // Speech detected again, reset silence timer
        this.silenceStartTime = null;
      }
    }

    this.animationFrameId = requestAnimationFrame(this.processFrame);
  };
}

