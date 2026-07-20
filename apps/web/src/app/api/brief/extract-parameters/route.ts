import { NextRequest, NextResponse } from "next/server";
import { extractParametersForRequest } from "@/lib/suvenir-server";
import { requireMinimumCredits } from "@/lib/api-credits";

const BRIEF_PARSE_MIN_CREDITS = 5;

export async function POST(req: NextRequest) {
  const denied = await requireMinimumCredits(BRIEF_PARSE_MIN_CREDITS);
  if (denied) return denied;

  try {
    const body = (await req.json()) as { requestId?: string };
    if (!body.requestId?.trim()) {
      return NextResponse.json({ message: "requestId required" }, { status: 400 });
    }
    const result = await extractParametersForRequest(body.requestId.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extract parameters failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
