import { NextRequest, NextResponse } from "next/server";
import { discoverCreativeConcepts } from "@/lib/suvenir-server";
import { requireAiAuth } from "@/lib/require-ai-auth";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await requireAiAuth();
  if (denied) return denied;

  try {
    const { requestId } = (await req.json()) as { requestId: string };
    if (!requestId) {
      return NextResponse.json({ message: "requestId required" }, { status: 400 });
    }
    const { agentRun, concepts } = await discoverCreativeConcepts(requestId);
    return NextResponse.json({ agentRun, concepts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discover failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
