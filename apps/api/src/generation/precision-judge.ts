export interface PrecisionVerdict {
  productUnchanged: boolean;
  imprintPlaced: boolean;
  looksPhysical: boolean;
  notes: string[];
}

export const JUDGE_PROMPT = [
  'You are a print-production QA reviewer. Image 1 is the original product photo. Image 2 is the same photo after a logo imprint was added.',
  'Answer ONLY with JSON: {"productUnchanged":bool,"imprintPlaced":bool,"looksPhysical":bool,"notes":[string]}',
  'productUnchanged: is the product shape, color, material, camera angle and background identical to image 1?',
  'imprintPlaced: is the imprint present and readable on the product surface?',
  'looksPhysical: does the imprint look physically applied (printed, engraved, embroidered) rather than a flat pasted sticker?',
  'notes: at most 3 short remarks in Russian, only about real problems. Empty array if everything is fine.',
].join(' ');

/** Разбирает ответ модели. Никогда не бросает — мусор превращается в null. */
export function parseJudgeResponse(raw: string): PrecisionVerdict | null {
  if (!raw?.trim()) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }

  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((n): n is string => typeof n === 'string').slice(0, 3)
    : [];

  return {
    productUnchanged: bool(parsed.productUnchanged, true),
    imprintPlaced: bool(parsed.imprintPlaced, true),
    looksPhysical: bool(parsed.looksPhysical, true),
    notes,
  };
}

/** Вердикт → русские предупреждения для интерфейса */
export function judgeVerdictWarnings(v: PrecisionVerdict): string[] {
  const out: string[] = [];
  if (!v.productUnchanged) out.push('Товар на результате отличается от исходного фото');
  if (!v.imprintPlaced) out.push('Нанесение не найдено на товаре');
  if (!v.looksPhysical) out.push('Нанесение выглядит наклейкой, а не реальной печатью');
  out.push(...v.notes);
  return out;
}
