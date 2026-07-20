function normalizeCountText(userPrompt: string): string {
  return String(userPrompt ?? '').toLowerCase().replace(/ё/g, 'е');
}

const WORD_NUMBERS: Record<string, number> = {
  один: 1,
  одна: 1,
  одно: 1,
  одну: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
};

function parseSingleItemCount(text: string): number | null {
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`(?:^|[\\s,.:;])${word}(?:[\\s,.:;]|$)`).test(text)) return n;
  }

  const patterns = [
    /(\d+)\s*бутыл/,
    /(\d+)\s*круж/,
    /(\d+)\s*термос/,
    /(\d+)\s*ручк/,
    /(\d+)\s*блокнот/,
    /(\d+)\s*(?:разн\w*|товар\w*|позици\w*|предмет\w*|штук\w*|вид\w*|издел\w*|составляющ\w*|компонент\w*)/,
    /(?:товар\w*|позици\w*|предмет\w*|круж\w*|вид\w*|издел\w*)[^\d]{0,12}(\d+)/,
    /набор\s+из\s+(\d+)/,
    /(\d+)\s+в\s+набор/i,
    /в\s+набор[е]?\s*(\d+)/i,
    /(\d+)\s+разных/,
    /(\d+)\s*(?:шт|штук)/,
    // Широкий «N слово» в начале — но НЕ когда дальше идёт срок/люди/деньги (после поднятия
    // потолка до 12 «10 лет компании»/«12 сотрудников» иначе стали бы «10/12 товаров»).
    /^(\d+)\s+(?!лет|год|мес|недел|дн[ейя]|час|сотрудник|человек|чел[ов.]|персон|подчин|гост|тысяч|миллион|руб|₽|процент|%)[а-яa-z]/,
  ];

  const wordQty = text.match(
    /(?:^|[\s,.:;])(один|одна|одну|два|две|три|четыре|пять|шесть|семь|восемь)[\s]+(?:товар|позици|предмет|вид|sku|круж|бутыл|издел)/i,
  );
  if (wordQty) {
    const n = WORD_NUMBERS[wordQty[1]];
    if (n) return n;
  }

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      // Потолок 12 = системный max позиций. Крупные числа (тираж «250 шт») остаются вне диапазона
      // и корректно НЕ считаются числом товаров.
      if (n >= 1 && n <= 12) return n;
    }
  }

  return null;
}

/** Диапазон количества предметов в наборе: «минимум 5», «5-7 предметов», «4–6 изделий» */
export function parseItemCountBounds(userPrompt: string): { min: number; max: number } | null {
  const text = normalizeCountText(userPrompt);

  const rangePatterns = [
    /(\d+)\s*[-–—]\s*(\d+)\s*(?:товар\w*|позици\w*|предмет\w*|издел\w*|составляющ\w*|компонент\w*|штук\w*|вид\w*)/i,
    /(?:товар\w*|позици\w*|предмет\w*|издел\w*)[^\d]{0,16}(\d+)\s*[-–—]\s*(\d+)/i,
    /(\d+)\s*[-–—]\s*(\d+)\s+в\s+набор/i,
    /в\s+набор[е]?\s*(\d+)\s*[-–—]\s*(\d+)/i,
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = parseInt(match[2], 10);
      if (min >= 1 && max >= min && max <= 12) return { min, max };
    }
  }

  const minOnly = text.match(
    /(?:минимум|как\s+минимум|не\s+менее|от)\s+(\d+)\s*(?:товар\w*|позици\w*|предмет\w*|издел\w*|составляющ\w*|компонент\w*|штук\w*|вид\w*)?/i,
  );
  if (minOnly) {
    const min = parseInt(minOnly[1], 10);
    if (min >= 1 && min <= 12) {
      const maxMatch = text.match(/(?:до|максимум|не\s+более)\s+(\d+)\s*(?:товар|позици|предмет|издел)/i);
      const max = maxMatch ? parseInt(maxMatch[1], 10) : Math.min(12, min + 2);
      return { min, max: Math.max(min, max) };
    }
  }

  const exact = parseSingleItemCount(text);
  if (exact != null) return { min: exact, max: exact };

  return null;
}

/** Сколько товаров просит пользователь в тексте брифа */
export function parseDesiredItemCount(userPrompt: string): number | null {
  const bounds = parseItemCountBounds(userPrompt);
  if (bounds) return Math.round((bounds.min + bounds.max) / 2);
  return parseSingleItemCount(normalizeCountText(userPrompt));
}

export function defaultItemCount(userPrompt: string): number {
  return parseDesiredItemCount(userPrompt) ?? 4;
}
