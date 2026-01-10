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

    this._createAndStartRecorder(stream);
  }

  private _createAndStartRecorder(stream: MediaStream) {
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
    // Stop current recorder to get all pending data
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

  clear() {
    // Clear chunks and restart recorder with fresh headers
    this.chunks = [];
    if (this.stream) {
      this._createAndStartRecorder(this.stream);
    }
  }

  isRecording() {
    return this.mediaRecorder?.state === "recording";
  }
}

