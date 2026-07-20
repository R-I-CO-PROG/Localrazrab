import type { BottomHighlight } from "./types";

const COLOR_WORDS =
  /^(gold|silver|black|white|red|blue|green|grey|gray|beige|navy|золот|серебр|чёрн|черн|бел|красн|син|зелен|сер|беж)/i;

function isLowQualityHighlight(h: BottomHighlight): boolean {
  const label = h.label.trim();
  const accent = h.accent.trim();
  if (!label || !accent) return true;
  if (/^\d+([.,]\d+)?\s*(₽|руб\.?)?$/i.test(label)) return true;
  if (COLOR_WORDS.test(accent) && accent.length < 24) return true;
  if (label.length < 6 && /₽|руб/i.test(label)) return true;
  return false;
}

export function sanitizeBottomHighlights(
  highlights: BottomHighlight[] | undefined,
  fallback: BottomHighlight[],
): BottomHighlight[] {
  const cleaned = (highlights ?? []).filter((h) => !isLowQualityHighlight(h));
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  return fallback;
}
