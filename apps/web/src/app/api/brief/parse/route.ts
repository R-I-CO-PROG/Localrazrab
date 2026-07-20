import { NextRequest, NextResponse } from "next/server";
import { parseBriefFromText } from "@/lib/suvenir-server";
import { requireMinimumCredits } from "@/lib/api-credits";

/** «Подобрать параметры из брифа» доступно при балансе ≥ 5 кредитов. */
const BRIEF_PARSE_MIN_CREDITS = 5;

export async function POST(req: NextRequest) {
  const denied = await requireMinimumCredits(BRIEF_PARSE_MIN_CREDITS);
  if (denied) return denied;

  try {
    const { userPrompt } = (await req.json()) as { userPrompt?: string };
    if (!userPrompt?.trim()) {
      return NextResponse.json({ message: "userPrompt required" }, { status: 400 });
    }
    const parsed = await parseBriefFromText(userPrompt.trim());
    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
