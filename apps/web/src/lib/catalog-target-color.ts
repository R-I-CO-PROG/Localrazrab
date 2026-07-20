/** Целевой цвет SKU из текста запроса, если он есть в списке вариантов */
export function pickTargetColorFromHint(hint: string, catalogColors: string[]): string | undefined {
  const h = hint.toLowerCase().replace(/ё/g, "е").trim();
  if (!h || catalogColors.length === 0) return undefined;

  for (const color of catalogColors) {
    const c = color.toLowerCase().replace(/ё/g, "е");
    if (h.includes(c)) return color;
    if (c.length >= 3 && h.includes(c.slice(0, 3))) return color;
  }

  const stems: Array<[string, string[]]> = [
    ["сер", ["сер", "grey", "gray", "графит"]],
    ["син", ["син", "blue"]],
    ["бел", ["бел", "white"]],
    ["черн", ["черн", "black"]],
    ["красн", ["красн", "red"]],
    ["зелен", ["зелен", "green"]],
    ["фиолет", ["фиолет", "purple"]],
    ["желт", ["желт", "yellow"]],
    ["оранж", ["оранж", "orange"]],
  ];

  for (const [label, patterns] of stems) {
    if (!patterns.some((p) => h.includes(p))) continue;
    const match = catalogColors.find((color) => {
      const c = color.toLowerCase().replace(/ё/g, "е");
      return c.includes(label) || label.includes(c.slice(0, 3));
    });
    if (match) return match;
  }

  return undefined;
}
