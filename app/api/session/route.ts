import { NextRequest, NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitStore = new Map<
  string,
  { count: number; windowStart: number }
>();

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

function isLoopbackHost(value: string) {
  return value.startsWith("localhost") || value.startsWith("127.0.0.1");
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (
          originHost !== host &&
          !(isLoopbackHost(originHost) && isLoopbackHost(host))
        ) {
          return NextResponse.json(
            { error: "Invalid origin" },
            { status: 403, headers: NO_STORE_HEADERS }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid origin" },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
    }

    const sessionSecret = process.env.SESSION_SECRET;
    if (sessionSecret) {
      const provided = request.headers.get("x-session-secret");
      if (provided !== sessionSecret) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401, headers: NO_STORE_HEADERS }
        );
      }
    }

    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: NO_STORE_HEADERS }
      );
    }
    const body = await request.json().catch(() => ({}));
    const allowedVoices = new Set([
      "alloy",
      "ash",
      "ballad",
      "coral",
      "sage",
      "verse",
    ]);
    const voice =
      typeof body?.voice === "string" && allowedVoices.has(body.voice)
        ? body.voice
        : "alloy";
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-realtime",
          voice,
          modalities: ["audio", "text"],
          instructions:
            "Start conversation with the user by saying 'Hello, how can I help you today?' Use the available tools when relevant. After executing a tool, you will need to respond (create a subsequent conversation item) to the user sharing the function result or error. If you do not respond with additional message with function result, user will not know you successfully executed the tool. Speak and respond in the language of the user. You can call stopSession when the user is done talking.",
          tool_choice: "auto",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: "OpenAI API request failed",
          details: errorText || "Unknown error",
        },
        {
          status: response.status,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const data = await response.json();

    // Return the JSON response to the client
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Error fetching session data:", error);
    return NextResponse.json(
      { error: "Failed to fetch session data" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
