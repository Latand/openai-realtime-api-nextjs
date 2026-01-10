import { getBestMimeType } from "./audio-utils";

export class AudioChunkManager {
  mediaRecorder: MediaRecorder | null = null;
  chunks: Blob[] = [];
  stream: MediaStream | null = null;
  mimeType: string;

  constructor() {
    this.mimeType = getBestMimeType();
  }

  startRecording(stream: MediaStream) {
    this.stream = stream;
    this.chunks = [];

    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: this.mimeType,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      // Collect chunks every 100ms
      this.mediaRecorder.start(100);
    } catch (error) {
      console.error("Failed to start MediaRecorder:", error);
      throw error;
    }
  }

  async stopAndGetAudio(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        resolve(new Blob(this.chunks, { type: this.mimeType }));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  async getAccumulatedAudio(): Promise<Blob> {
    // Return what we have so far
    return new Blob(this.chunks, { type: this.mimeType });
  }

  clear() {
    this.chunks = [];
  }

  isRecording() {
    return this.mediaRecorder?.state === "recording";
  }
}

