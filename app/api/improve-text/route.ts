import { NextResponse } from "next/server";
import { STYLE_PROMPTS, ImprovementStyle } from "@/lib/text-improvement-prompts";

export async function POST(req: Request) {
  try {
    const { originalText, style, additionalInstructions } = await req.json();

    if (!originalText) {
      return NextResponse.json({ error: "Missing originalText" }, { status: 400 });
    }

    const selectedStyle = (style as ImprovementStyle) || 'your-style';
    const systemPrompt = STYLE_PROMPTS[selectedStyle] || STYLE_PROMPTS['your-style'];

    let userPrompt = `Original text:\n"${originalText}"`;
    if (additionalInstructions) {
      userPrompt += `\n\nAdditional instructions:\n${additionalInstructions}`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json({ error: errorData.error?.message || "OpenAI API error" }, { status: response.status });
    }

    const data = await response.json();
    const improvedText = data.choices[0]?.message?.content || "";

    return NextResponse.json({ improvedText });

  } catch (error) {
    console.error("Text improvement error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

