import { NextRequest, NextResponse } from "next/server";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function transcribeWithRetry(
  audioFile: File,
  apiKey: string
): Promise<{ success: boolean; data?: unknown; error?: string; retryable?: boolean }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Create fresh form data for each attempt
      const openaiFormData = new FormData();
      openaiFormData.append("file", audioFile, "audio.webm");
      openaiFormData.append("model", "whisper-1");
      openaiFormData.append("response_format", "json");

      console.log(`[Transcribe] Attempt ${attempt + 1}/${MAX_RETRIES}...`);

      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: openaiFormData,
        },
        REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        // Rate limit or server errors are retryable
        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`API error ${response.status}: ${errorText}`);
          console.warn(`[Transcribe] Retryable error on attempt ${attempt + 1}:`, lastError.message);
        } else {
          // Client errors (4xx except 429) are not retryable
          return {
            success: false,
            error: `OpenAI API error: ${errorText || "Unknown error"}`,
            retryable: false,
          };
        }
      } else {
        const data = await response.json();
        console.log(`[Transcribe] Success on attempt ${attempt + 1}`);
        return { success: true, data };
      }
    } catch (error) {
      lastError = error as Error;
      const isTimeout = lastError.name === "AbortError" ||
        lastError.message.includes("timeout") ||
        lastError.message.includes("ETIMEDOUT") ||
        lastError.cause?.toString().includes("ConnectTimeoutError");

      console.warn(`[Transcribe] Error on attempt ${attempt + 1}:`, lastError.message, isTimeout ? "(timeout)" : "");
    }

    // Wait before retry with exponential backoff
    if (attempt < MAX_RETRIES - 1) {
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.log(`[Transcribe] Waiting ${delayMs}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    success: false,
    error: lastError?.message || "Failed after all retries",
    retryable: true, // Client can try again later
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await transcribeWithRetry(audioFile, process.env.OPENAI_API_KEY);

    if (result.success) {
      return NextResponse.json(result.data, { headers: NO_STORE_HEADERS });
    } else {
      return NextResponse.json(
        {
          error: result.error || "Transcription failed",
          retryable: result.retryable ?? true,
        },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio", retryable: true },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
