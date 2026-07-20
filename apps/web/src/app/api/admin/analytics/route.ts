import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { buildAnalytics, isAnalyticsPeriod } from "@/lib/admin-analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") ?? "30d";
  const period = isAnalyticsPeriod(periodParam) ? periodParam : "30d";

  try {
    const data = await buildAnalytics(period);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка аналитики";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
