import { NextRequest, NextResponse } from "next/server";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { messages, additionalNotes } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Format conversation for summarization
    const conversationText = messages
      .map((m: { role: string; text: string }) => `${m.role}: ${m.text}`)
      .join("\n");

    // Add additional notes if provided
    const notesSection = additionalNotes
      ? `\n\nUser's additional notes about this conversation:\n${additionalNotes}`
      : "";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.1-chat-latest",
        messages: [
          {
            role: "system",
            content: `You are a conversation summarizer. Compress the following conversation into a concise summary of maximum 500 characters.
Focus on:
- Key topics discussed
- Important decisions or actions taken
- Any pending tasks or follow-ups
- User preferences revealed
${additionalNotes ? "- Include the user's additional notes as important context" : ""}

Output format: A single paragraph summary. Be concise but preserve critical context.`,
          },
          {
            role: "user",
            content: conversationText + notesSection,
          },
        ],
        max_completion_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return NextResponse.json(
        { error: "Failed to compact conversation", details: errorText },
        { status: response.status, headers: NO_STORE_HEADERS }
      );
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || "";

    // Extract topics from the conversation
    const topics = extractTopics(messages);

    return NextResponse.json(
      {
        summary,
        topics,
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Error compacting conversation:", error);
    return NextResponse.json(
      { error: "Failed to compact conversation" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

function extractTopics(messages: { role: string; text: string }[]): string[] {
  const topics = new Set<string>();
  const keywords = [
    "spotify",
    "music",
    "claude",
    "code",
    "file",
    "website",
    "app",
    "terminal",
    "volume",
    "clipboard",
    "search",
    "weather",
    "time",
    "reminder",
  ];

  for (const msg of messages) {
    const text = msg.text?.toLowerCase() || "";
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        topics.add(keyword);
      }
    }
  }

  return Array.from(topics).slice(0, 5);
}
