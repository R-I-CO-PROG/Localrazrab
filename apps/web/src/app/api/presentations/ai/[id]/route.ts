import { NextRequest, NextResponse } from "next/server";
import { loadJob } from "@/lib/presentation-ai/storage/job-store";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await loadJob(id);

  if (!job) {
    return NextResponse.json({ error: "Презентация не найдена" }, { status: 404 });
  }

  return NextResponse.json(job);
}
