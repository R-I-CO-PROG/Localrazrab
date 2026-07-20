import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import type { WorkspacePayload } from "@/lib/workspace-types";

/** Полный воркспейс одного пользователя (проекты/концепции/визуализации/файлы/презентации). */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { userId } = await ctx.params;
  const [user, row] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, plan: true, createdAt: true },
    }),
    prisma.userWorkspace.findUnique({ where: { userId } }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  return NextResponse.json({
    user,
    updatedAt: row?.updatedAt ?? null,
    payload: (row?.payload ?? null) as WorkspacePayload | null,
  });
}
