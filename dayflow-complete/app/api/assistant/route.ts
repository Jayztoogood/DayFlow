import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
    if (message.length > 6000) return NextResponse.json({ error: "Message is too long. Please shorten it." }, { status: 400 });
    const history = Array.isArray(body.messages)
      ? body.messages.slice(-20).flatMap((item: unknown) => {
          if (!item || typeof item !== "object") return [];
          const entry = item as { role?: unknown; content?: unknown };
          if ((entry.role !== "user" && entry.role !== "assistant") || typeof entry.content !== "string") return [];
          return [{ role: entry.role, content: entry.content.slice(0, 6000) }];
        })
      : [{ role: "user" as const, content: message }];

    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "The AI assistant needs OPENAI_API_KEY in .env.local. Add your key and restart Dayflow to enable real assistant replies." }, { status: 503 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Dayflow, a friendly and practical personal organization assistant. Help users plan, learn, and organize everyday tasks. Be clear, concise, and actionable. Do not claim to have created calendar events, sent reminders, accessed accounts, or changed data unless a connected tool actually did so. For financial topics, provide general organization and educational information, not personalized investment instructions. Encourage users to verify important information." },
        ...history
      ],
      max_tokens: 650,
      temperature: 0.6
    });
    const reply = completion.choices[0]?.message?.content?.trim() || "I couldn't create a response. Please try again.";
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "Dayflow couldn't process that request. Please try again." }, { status: 500 });
  }
}
