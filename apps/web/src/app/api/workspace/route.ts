import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { WorkspacePayload } from "@/lib/workspace-types";

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ payload: null, updatedAt: null, userId: null });
  }

  try {
    const row = await prisma.userWorkspace.findUnique({ where: { userId: user.id } });
    if (!row) {
      return NextResponse.json({ payload: null, updatedAt: null, userId: user.id });
    }
    return NextResponse.json({
      payload: row.payload as unknown as WorkspacePayload,
      updatedAt: row.updatedAt.toISOString(),
      userId: user.id,
    });
  } catch (error) {
    console.error("[workspace GET]", error);
    return NextResponse.json({ payload: null, updatedAt: null, userId: user.id });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { payload?: WorkspacePayload };
    if (!body.payload || typeof body.payload !== "object") {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }

    const row = await prisma.userWorkspace.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        payload: body.payload as unknown as Prisma.InputJsonValue,
      },
      update: {
        payload: body.payload as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true, updatedAt: row.updatedAt.toISOString() });
  } catch (error) {
    console.error("[workspace PUT]", error);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
