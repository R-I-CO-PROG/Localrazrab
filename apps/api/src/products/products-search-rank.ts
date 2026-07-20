/**
 * Релевантность поиска товара по названию/артикулу для пикера «Точное нанесение».
 *
 * Проблема исходной выдачи: `name ILIKE %q%`, отсортированная по алфавиту, показывала «всё
 * подряд» — 6 цвето-вариантов одного товара занимали топ, а подстрока ловила словоформы в
 * несвязанных товарах («ручка» → «скакалка с мягкими ручкАМИ»). Здесь:
 *   1) ранжируем по силе совпадения: точный артикул/имя → префикс → слово целиком → подстрока;
 *   2) при равном ранге — короче имя выше (меньше шума);
 *   3) схлопываем цвето/размер-варианты одного товара в одну карточку.
 */

export interface RankableProduct {
  name: string | null;
  externalId?: string | null;
}

/** Цветовые/финишные слова — по ним опознаём вариант-хвост вроде «… - Белый». */
const COLOR_WORD =
  /(бел|чёрн|черн|сер(?:ый|ебр|о|е)|син|голуб|красн|зелён|зелен|оранж|жёлт|желт|фиолет|розов|бордов|бронз|золот|беж|коричн|бирюз|салат|пурпур|прозрачн|натуральн|металлик|глянц|матов|сплошн|хаки|мятн|лайм|индиго|терракот|антрацит|графит)/i;

/** Хвост-размер целиком: «350 мл», «5000 mAh», «210 мм». */
const PURE_SIZE = /^\d+\s*(мл|l|л|мм|см|mah|мач|gb|гб|вт|w|шт)$/i;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * База товара без вариант-хвоста: срезаем хвост после разделителя (,-–—), ЕСЛИ он —
 * короткий цвет (≤2 слов) или чистый размер. Только с разделителем — чтобы не съесть
 * значащие части («… для путешествия 310 мл» без запятой не режется). Консервативно:
 * НЕ трогаем многословные хвосты подарочных наборов.
 */
export function productSearchBaseName(name: string): string {
  let s = (name ?? '').trim();
  for (let i = 0; i < 4; i++) {
    const m = s.match(/^(.*[^\s,\-–—])\s*[,\-–—]\s*([^,\-–—]+)$/);
    if (!m) break;
    const head = m[1].trim();
    const tail = m[2].trim();
    const isColor = COLOR_WORD.test(tail) && wordCount(tail) <= 2;
    const isSize = PURE_SIZE.test(tail);
    if ((isColor || isSize) && head.length >= 3) {
      s = head;
      continue;
    }
    break;
  }
  return s.toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Чем меньше — тем релевантнее. */
function score(name: string, externalId: string | null | undefined, q: string): number {
  const n = name.toLowerCase();
  const qq = q.toLowerCase();
  if (externalId && externalId.toLowerCase() === qq) return 0; // точный артикул
  if (n === qq) return 0;
  if (n.startsWith(qq)) return 1;
  // Слово целиком: вокруг q нет букв/цифр (кириллица/латиница) — «ручка» ≠ «ручкАМИ».
  const word = new RegExp('(^|[^0-9a-zа-яё])' + escapeRe(qq) + '([^0-9a-zа-яё]|$)', 'iu');
  if (word.test(n)) return 2;
  if (n.includes(qq)) return 3;
  return 4;
}

/**
 * Ранжирует и схлопывает варианты. Возвращает новый массив: лучший представитель каждого
 * базового товара, от самого релевантного к наименее.
 */
export function rankProductsBySearch<T extends RankableProduct>(pool: T[], query: string): T[] {
  const q = (query ?? '').trim();
  if (!q) return pool.slice();

  const scored = pool.map((p, i) => ({
    p,
    i,
    s: score(p.name ?? '', p.externalId, q),
    len: (p.name ?? '').length,
    base: productSearchBaseName(p.name ?? ''),
  }));

  scored.sort(
    (a, b) =>
      a.s - b.s ||
      a.len - b.len ||
      (a.p.name ?? '').localeCompare(b.p.name ?? '', 'ru') ||
      a.i - b.i,
  );

  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of scored) {
    const key = it.base || (it.p.name ?? '').toLowerCase() || String(it.i);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it.p);
  }
  return out;
}
