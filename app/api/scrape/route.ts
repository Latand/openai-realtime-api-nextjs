import { NextRequest, NextResponse } from "next/server";
import FirecrawlApp from "@mendable/firecrawl-js";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

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
  const existing = rateLimitStore.get(ip);
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }
  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

function parseSafeUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey =
      process.env.FIRECRAWL_API_KEY ||
      process.env.NEXT_PUBLIC_FIRECRAWL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "FIRECRAWL_API_KEY is not set" },
        { status: 500, headers: NO_STORE_HEADERS }
      );
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
    const url = typeof body?.url === "string" ? body.url : "";
    if (!url) {
      return NextResponse.json(
        { error: "Missing URL" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const safeUrl = parseSafeUrl(url);
    if (!safeUrl) {
      return NextResponse.json(
        { error: "Invalid or unsupported URL." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const app = new FirecrawlApp({ apiKey });
    const result = await app.scrapeUrl(safeUrl, {
      formats: ["markdown", "html"],
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to scrape" },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        markdown: result.markdown,
        html: result.html,
        metadata: result.metadata,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Error scraping website:", error);
    return NextResponse.json(
      { error: "Failed to scrape website" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
