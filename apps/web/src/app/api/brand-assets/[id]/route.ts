import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const { id } = await context.params;
  const asset = await prisma.brandAsset.findFirst({
    where: { id, userId: user.id, deletedAt: null },
  });
  if (!asset) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  await prisma.brandAsset.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
