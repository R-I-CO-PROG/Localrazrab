import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import type { WorkspacePayload } from "@/lib/workspace-types";

/** Список всех пользователей + сводка по их воркспейсу (для админ-обзора «смотреть всё»). */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const rows = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      plan: true,
      createdAt: true,
      workspace: { select: { updatedAt: true, payload: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const users = rows.map((u) => {
    const p = (u.workspace?.payload ?? null) as WorkspacePayload | null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      plan: u.plan,
      createdAt: u.createdAt,
      updatedAt: u.workspace?.updatedAt ?? null,
      counts: {
        projects: p?.projects?.length ?? 0,
        concepts: p?.concepts?.length ?? 0,
        visualizations: p?.visualizations?.length ?? 0,
        presentations: p?.presentations?.length ?? 0,
        files: p?.brandLibrary?.length ?? 0,
      },
    };
  });

  return NextResponse.json({ users });
}
