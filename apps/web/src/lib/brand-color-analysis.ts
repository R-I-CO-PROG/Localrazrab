import type { BrandColorAnalysisResult, BrandStyle } from "@/lib/brand-palette";

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function isNearWhiteOrBlack([r, g, b]: [number, number, number]): boolean {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 245 || lum < 12;
}

function quantizeBucket(v: number): number {
  return Math.round(v / 32) * 32;
}

function inferStyle(colors: string[]): BrandStyle {
  if (colors.length === 0) return "neutral";

  const rgbs = colors.map((hex) => {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ] as [number, number, number];
  });

  const saturations = rgbs.map(([r, g, b]) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  });
  const avgSat = saturations.reduce((a, b) => a + b, 0) / saturations.length;
  const avgLum =
    rgbs.reduce((sum, [r, g, b]) => sum + (0.299 * r + 0.587 * g + 0.114 * b), 0) /
    rgbs.length;

  if (colors.length <= 2 && avgSat < 0.15) return "minimal";
  if (avgLum < 60 && avgSat < 0.35) return "premium";
  if (avgSat > 0.55) return "vibrant";
  if (avgSat < 0.2 && avgLum > 180) return "strict";
  if (colors.some((c) => /^#0[0-9A-F]/i.test(c) || /^#1[0-9A-F]/i.test(c))) return "tech";
  if (avgSat < 0.35) return "classic";
  return "neutral";
}

export async function extractColorsFromImageFile(file: File): Promise<BrandColorAnalysisResult> {
  if (!file.type.startsWith("image/")) {
    return {
      colors: [],
      style: "neutral",
      source: "unsupported",
      message: "Формат не поддерживается для анализа цветов",
    };
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { colors: [], style: "neutral", source: "image", message: "Не удалось прочитать изображение" };
  }

  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, size, size);

  const buckets = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;
    const rgb: [number, number, number] = [
      quantizeBucket(data[i]),
      quantizeBucket(data[i + 1]),
      quantizeBucket(data[i + 2]),
    ];
    if (isNearWhiteOrBlack(rgb)) continue;
    const key = rgb.join(",");
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const picked: string[] = [];

  for (const [key] of sorted) {
    const [r, g, b] = key.split(",").map(Number) as [number, number, number];
    const hex = rgbToHex(r, g, b);
    const tooClose = picked.some((existing) => {
      const eh = existing.replace("#", "");
      const er = parseInt(eh.slice(0, 2), 16);
      const eg = parseInt(eh.slice(2, 4), 16);
      const eb = parseInt(eh.slice(4, 6), 16);
      return colorDistance([r, g, b], [er, eg, eb]) < 48;
    });
    if (!tooClose) picked.push(hex);
    if (picked.length >= 6) break;
  }

  const colors = picked.length > 0 ? picked : ["#1A1A1A", "#7C3AED"];
  return {
    colors,
    style: inferStyle(colors),
    source: "image",
  };
}

export async function analyzeBrandFile(file: File): Promise<BrandColorAnalysisResult> {
  if (file.type === "application/pdf") {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/brand/analyze", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        colors: [],
        style: "neutral",
        source: "pdf",
        message: data.error ?? "Не удалось проанализировать PDF",
      };
    }
    return res.json();
  }

  if (file.type.startsWith("image/")) {
    return extractColorsFromImageFile(file);
  }

  return {
    colors: [],
    style: "neutral",
    source: "unsupported",
    message: "Загрузите PNG, JPG, WEBP, SVG или PDF для анализа цветов",
  };
}
