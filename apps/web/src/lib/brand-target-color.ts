/** Подбор названия цвета SKU под фирменный hex брифа (для UI) */

const NAME_RGB: Array<{ re: RegExp; rgb: [number, number, number] }> = [
  { re: /\bжелт\w*|yellow|золот|gold|янтар/i, rgb: [251, 191, 36] },
  { re: /\bоранж\w*|orange/i, rgb: [249, 115, 22] },
  { re: /\bсин\w*|blue|navy|темно-син/i, rgb: [37, 99, 235] },
  { re: /\bголуб\w*|небесн|sky/i, rgb: [56, 189, 248] },
  { re: /\bкрасн\w*|red/i, rgb: [239, 68, 68] },
  { re: /\bзелен\w*|green/i, rgb: [34, 197, 94] },
  { re: /\bфиолет\w*|purple/i, rgb: [124, 92, 252] },
  { re: /\bбел\w*|white/i, rgb: [245, 245, 245] },
  { re: /\bчерн\w*|black/i, rgb: [26, 26, 26] },
  { re: /\bсер\w*|grey|gray/i, rgb: [156, 163, 175] },
];

function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return null;
  const full =
    raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padStart(6, "0").slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

function inferRgbFromLabel(label: string): [number, number, number] | null {
  for (const rule of NAME_RGB) {
    if (rule.re.test(label)) return rule.rgb;
  }
  return hexToRgb(label);
}

export function pickTargetColorForBrand(
  catalogColors: string[],
  brandColors: string[],
  productName = "",
): string | undefined {
  const brandRgbs = brandColors.map(hexToRgb).filter((x): x is [number, number, number] => Boolean(x));
  if (!brandRgbs.length) return undefined;

  let best: { name: string; dist: number } | undefined;

  for (const color of catalogColors) {
    const rgb = inferRgbFromLabel(color);
    if (!rgb) continue;
    const dist = Math.min(...brandRgbs.map((b) => rgbDistance(rgb, b)));
    if (!best || dist < best.dist) best = { name: color, dist };
  }

  if (best && best.dist < 130) return best.name;

  const nameRgb = inferRgbFromLabel(productName);
  if (nameRgb) {
    const dist = Math.min(...brandRgbs.map((b) => rgbDistance(nameRgb, b)));
    if (dist < 100) {
      const rule = NAME_RGB.find((r) => r.re.test(productName));
      const m = productName.match(rule?.re ?? /$^/);
      if (m?.[0]) return m[0];
    }
  }

  return undefined;
}
