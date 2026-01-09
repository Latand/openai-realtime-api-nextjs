import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { STYLE_PROMPTS, ImprovementStyle, LanguageOption, getLanguageInstruction } from "@/lib/text-improvement-prompts";

export async function POST(req: Request) {
  try {
    const { originalText, style, language, additionalInstructions } = await req.json();

    if (!originalText) {
      return NextResponse.json({ error: "Missing originalText" }, { status: 400 });
    }

    const selectedStyle = (style as ImprovementStyle) || 'your-style';
    const selectedLanguage = (language as LanguageOption) || 'auto';

    let systemPrompt = STYLE_PROMPTS[selectedStyle] || STYLE_PROMPTS['your-style'];

    // Append language instruction
    systemPrompt += `\n\n${getLanguageInstruction(selectedLanguage)}`;

    let userPrompt = `Original text:\n"${originalText}"`;
    if (additionalInstructions) {
      userPrompt += `\n\nAdditional instructions:\n${additionalInstructions}`;
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
    });

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          stream.on('text', (text) => {
            controller.enqueue(encoder.encode(text));
          });

          await stream.finalMessage();
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
        }
      },
    });

    return new NextResponse(readableStream);

  } catch (error) {
    console.error("Text improvement error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
