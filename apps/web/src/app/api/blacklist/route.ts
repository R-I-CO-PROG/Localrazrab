import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  itemType: z.enum(["product", "supplier"]),
  itemId: z.string().min(1),
  title: z.string().min(1),
  projectId: z.string().optional(),
});

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ items: [] });
  }

  const items = await prisma.userBlacklistItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      userId: item.userId,
      projectId: item.projectId ?? undefined,
      itemType: item.itemType,
      itemId: item.itemId,
      title: item.title,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await request.json());
    const item = await prisma.userBlacklistItem.upsert({
      where: {
        userId_itemType_itemId: {
          userId: user.id,
          itemType: body.itemType,
          itemId: body.itemId,
        },
      },
      create: {
        userId: user.id,
        projectId: body.projectId,
        itemType: body.itemType,
        itemId: body.itemId,
        title: body.title,
      },
      update: {
        title: body.title,
        projectId: body.projectId,
      },
    });

    return NextResponse.json({
      item: {
        id: item.id,
        userId: item.userId,
        projectId: item.projectId ?? undefined,
        itemType: item.itemType,
        itemId: item.itemId,
        title: item.title,
        createdAt: item.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    console.error("[blacklist POST]", error);
    return NextResponse.json({ error: "Не удалось добавить в Black List" }, { status: 500 });
  }
}
