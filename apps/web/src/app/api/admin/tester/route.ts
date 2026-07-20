import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { buildState, getRunDetail, runBatch, isRunning, MAX_BATCH } from "@/lib/admin-tester";

export const dynamic = "force-dynamic";
// Прогон длится десятки секунд — поднимаем лимит на случай serverless-окружения.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const detail = await getRunDetail(id);
      if (!detail) return NextResponse.json({ error: "Прогон не найден" }, { status: 404 });
      return NextResponse.json(detail);
    }
    const state = await buildState();
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка тестера";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (isRunning()) {
    return NextResponse.json({ error: "Прогон уже идёт — дождитесь завершения" }, { status: 409 });
  }

  let body: { count?: unknown } = {};
  try {
    body = (await request.json()) as { count?: unknown };
  } catch {
    /* пустое тело — count по умолчанию 1 */
  }

  // Жёсткий кламп: только 1..MAX_BATCH. Бесконечного режима нет.
  const raw = Number(body.count);
  if (!Number.isFinite(raw) || raw < 1) {
    return NextResponse.json({ error: "count должен быть числом ≥ 1" }, { status: 400 });
  }
  const count = Math.min(MAX_BATCH, Math.max(1, Math.floor(raw)));

  try {
    const summary = await runBatch(count);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка прогона";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
