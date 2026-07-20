import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function uploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), "../../uploads");
}

export async function GET() {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ assets: [] });
  }

  try {
    const assets = await prisma.brandAsset.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      assets: assets.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        fileUrl: a.fileUrl,
        thumbnailUrl: a.thumbnailUrl ?? undefined,
        mimeType: a.mimeType,
        size: a.size,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[brand-assets GET]", error);
    return NextResponse.json({ assets: [] });
  }
}

export async function POST(request: NextRequest) {
  const user = await getOrCreateDbUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const typeRaw = String(form.get("type") ?? "logo");
    const name = String(form.get("name") ?? "asset");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }
    if (typeRaw !== "logo" && typeRaw !== "brandbook") {
      return NextResponse.json({ error: "Некорректный тип" }, { status: 400 });
    }

    const ext = extname(file.name) || (file.type.includes("pdf") ? ".pdf" : ".png");
    const id = randomUUID();
    const relDir = `brand-assets/${user.id}`;
    const fileName = `${id}${ext}`;
    const dir = join(uploadsDir(), relDir);
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(dir, fileName), buffer);

    const fileUrl = `/uploads/${relDir}/${fileName}`;
    const isImage = file.type.startsWith("image/");
    const thumbnailUrl = isImage ? fileUrl : null;

    const asset = await prisma.brandAsset.create({
      data: {
        userId: user.id,
        type: typeRaw,
        name: name || file.name,
        fileUrl,
        thumbnailUrl,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      },
    });

    return NextResponse.json({
      asset: {
        id: asset.id,
        type: asset.type,
        name: asset.name,
        fileUrl: asset.fileUrl,
        thumbnailUrl: asset.thumbnailUrl ?? undefined,
        mimeType: asset.mimeType,
        size: asset.size,
        createdAt: asset.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[brand-assets POST]", error);
    return NextResponse.json({ error: "Не удалось сохранить файл" }, { status: 500 });
  }
}
