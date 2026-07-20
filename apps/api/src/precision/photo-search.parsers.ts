export interface PhotoDescription {
  productType: string;
  category: string | null;
  material: string | null;
  dominantColor: string | null;
  keywords: string[];
}

export interface PhotoMatch {
  productId: string;
  similarity: number;
  reason: string;
}

export const DESCRIBE_PROMPT = [
  'Look at this product photo. Answer ONLY with JSON:',
  '{"productType":string,"category":string,"material":string,"dominantColor":string,"keywords":[string]}',
  'productType and keywords in Russian, keywords: 2-5 nouns a Russian promo catalog would use for this item.',
].join(' ');

/**
 * Грубый стем русского слова для поиска подстрокой: срезаем типовое окончание, чтобы
 * «кружки»/«кружку» находили название «кружка». Модель описания часто отдаёт слово во
 * множественном/падеже, а `name ILIKE %слово%` в единственном его не ловит. Без морфоанализа —
 * достаточно среза, точное совпадение потом уточнит визуальный ре-ранк.
 */
export function stemRu(word: string): string {
  const w = (word ?? '').trim().toLowerCase();
  if (w.length < 5) return w;
  const stem = w.replace(/(ами|ями|ов|ев|ах|ях|ый|ий|ая|яя|ое|ее|ы|и|а|я|у|ю|е|о|ь|й)$/, '');
  return stem.length >= 3 ? stem : w;
}

/** Уникальные стем-термы для ретривала кандидатов: тип товара + ключевые слова. */
export function photoSearchTerms(d: PhotoDescription): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [d.productType, ...d.keywords]) {
    const t = stemRu(raw);
    if (t.length >= 3 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function parsePhotoDescription(raw: string): PhotoDescription | null {
  const m = raw?.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const productType = str(p.productType);
  if (!productType) return null;
  return {
    productType,
    category: str(p.category),
    material: str(p.material),
    dominantColor: str(p.dominantColor),
    keywords: Array.isArray(p.keywords) ? p.keywords.filter((k): k is string => typeof k === 'string') : [],
  };
}

export function parseRerankResponse(raw: string, allowedIds: string[]): PhotoMatch[] {
  const m = raw?.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let p: { matches?: Array<Record<string, unknown>> };
  try {
    p = JSON.parse(m[0]) as { matches?: Array<Record<string, unknown>> };
  } catch {
    return [];
  }
  const allowed = new Set(allowedIds);
  return (Array.isArray(p.matches) ? p.matches : [])
    .filter((x) => typeof x.productId === 'string' && allowed.has(x.productId))
    .map((x) => ({
      productId: x.productId as string,
      similarity: Math.max(0, Math.min(100, Number(x.similarity) || 0)),
      reason: typeof x.reason === 'string' ? x.reason : '',
    }))
    .sort((a, b) => b.similarity - a.similarity);
}
