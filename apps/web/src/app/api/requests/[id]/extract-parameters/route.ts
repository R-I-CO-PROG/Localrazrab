import { NextRequest, NextResponse } from "next/server";
import { extractParametersForRequest } from "@/lib/suvenir-server";
import { requireMinimumCredits } from "@/lib/api-credits";

const BRIEF_PARSE_MIN_CREDITS = 5;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireMinimumCredits(BRIEF_PARSE_MIN_CREDITS);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ message: "request id required" }, { status: 400 });
    }
    const result = await extractParametersForRequest(id.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extract parameters failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
