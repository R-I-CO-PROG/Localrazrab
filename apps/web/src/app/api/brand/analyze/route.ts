import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import type { BrandColorAnalysisResult, BrandStyle } from "@/lib/brand-palette";

function inferStyleFromColors(colors: string[]): BrandStyle {
  if (colors.length <= 2) return "minimal";
  const dark = colors.filter((c) => {
    const h = c.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b < 80;
  }).length;
  if (dark >= 2) return "premium";
  return "classic";
}

function statsToHex(stats: sharp.Stats): string[] {
  const channels = [stats.channels[0], stats.channels[1], stats.channels[2]];
  const dominant = channels.map((ch) => Math.round(ch.mean));
  const hex = `#${dominant.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

  const extras = channels
    .map((ch) => Math.round(ch.max))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3)
    .map((v) => `#${[v, v, v].map((x) => x.toString(16).padStart(2, "0")).join("")}`);

  return [hex, ...extras].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let imageBuffer: Buffer | null = null;
    let source: BrandColorAnalysisResult["source"] = "image";

    if (file.type === "application/pdf") {
      source = "pdf";
      try {
        imageBuffer = await sharp(buffer, { density: 120, page: 0 })
          .resize(256, 256, { fit: "inside" })
          .png()
          .toBuffer();
      } catch {
        return NextResponse.json({
          colors: ["#1A1A1A", "#7C3AED"],
          style: "neutral",
          source: "pdf",
          message:
            "PDF сохранён, но цвета не извлечены автоматически. Загрузите PNG/JPG или задайте палитру вручную.",
        } satisfies BrandColorAnalysisResult);
      }
    } else if (file.type.startsWith("image/")) {
      imageBuffer = await sharp(buffer).resize(256, 256, { fit: "inside" }).png().toBuffer();
    } else {
      return NextResponse.json({ error: "Неподдерживаемый формат файла" }, { status: 400 });
    }

    const stats = await sharp(imageBuffer).stats();
    const colors = statsToHex(stats);
    const style = inferStyleFromColors(colors);

    return NextResponse.json({
      colors,
      style,
      source,
    } satisfies BrandColorAnalysisResult);
  } catch (error) {
    console.error("[brand/analyze]", error);
    return NextResponse.json({ error: "Ошибка анализа файла" }, { status: 500 });
  }
}
