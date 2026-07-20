import type { CatalogProduct } from './catalog.util';

/**
 * КОМПОЗИЦИОННЫЙ СЛОЙ. Человек-байер оценивает не товар по отдельности, а НАБОР как цельную
 * историю: вещи должны усиливать друг друга (термос+чай+плед), а не быть случайной свалкой
 * валидных предметов. Этот модуль даёт «Gift DNA» (семантические оси товара), граф совместимости
 * (синергии/конфликты пар) и композиционный скор набора. Детерминированно по имени/типу — база
 * под будущие эмбеддинги (оси легко заменить на векторное сходство, интерфейс не меняется).
 */

/** Оси «ДНК подарка» — эмоционально-функциональные признаки, которыми мыслит байер. */
export type GiftDnaAxis =
  | 'cozy' | 'energy' | 'travel' | 'work' | 'premium' | 'care'
  | 'focus' | 'relax' | 'sport' | 'creative' | 'eco' | 'tech';

/** Паттерн-детектор для каждой оси (по имени+категории+типу товара). Товар может нести несколько. */
const DNA_PATTERNS: Array<{ axis: GiftDnaAxis; re: RegExp }> = [
  { axis: 'cozy', re: /плед|свеч|аром(?:ат|о)|(?<![а-яё])чай(?![а-яё])|какао|тепл|hygge|уют|подушк|носк|варежк/i },
  { axis: 'energy', re: /термокруж|термос|кофе|эспрессо|power\s*bank|повербанк|аккумулятор|заряд|бодр|энерг|витамин/i },
  { axis: 'travel', re: /рюкзак|(?<![а-яё])сумк|шоппер|органайзер|несессер|дорожн|тревел|(?<![а-яё])зонт|термокруж|чемодан|бирк[аи]\s*для\s*багаж/i },
  { axis: 'work', re: /ежедневник|блокнот|планинг|(?<![а-яё])ручк|папк|визитниц|кардхолдер|стилус|органайзер\s*для|бейдж|лонгслив/i },
  { axis: 'premium', re: /кожа|кожан|металл|футляр|гравировк|премиум|дерев|латун|бамбук|стальн|бренд/i },
  { axis: 'care', re: /бальзам|крем|(?<![а-яё])маск|уход|витамин|аптечк|плед|аром(?:ат|о)|термос|санитайзер|антисептик/i },
  { axis: 'focus', re: /наушник|термокруж|блокнот|(?<![а-яё])таймер|лампа|подставк\s*для\s*ноут|коврик\s*для\s*мыш/i },
  { axis: 'relax', re: /плед|аром(?:ат|о)|свеч|(?<![а-яё])чай(?![а-яё])|массаж|подушк|маск[аи]\s*для\s*сна|термокруж|какао/i },
  { axis: 'sport', re: /бутыл|шейкер|фитнес|полотенц|скакалк|(?<![а-яё])мяч|спорт|эспандер|трениров/i },
  { axis: 'creative', re: /маркер|скетч|акварел|рисов|краск|кист|стикер|раскрас|для\s*творч/i },
  { axis: 'eco', re: /переработ|бамбук|органик|rpet|(?<![а-яё])эко|(?<![а-яё])лён|(?<![а-яё])лен(?![а-яё])|джут|крафт|натуральн/i },
  { axis: 'tech', re: /usb|гаджет|power\s*bank|повербанк|аккумулятор|заряд|беспровод|bluetooth|колонк|наушник|флеш|хаб|кабель|смарт/i },
];

const productText = (p: CatalogProduct) =>
  `${p.name} ${p.description ?? ''} ${p.subcategory ?? ''} ${p.category ?? ''}`.toLowerCase();

/** «ДНК» товара — множество осей, которые он несёт. */
export function productDna(p: CatalogProduct): Set<GiftDnaAxis> {
  const t = productText(p);
  const axes = new Set<GiftDnaAxis>();
  for (const { axis, re } of DNA_PATTERNS) if (re.test(t)) axes.add(axis);
  return axes;
}

/** ДНК-профиль аудитории брифа — какие оси делают набор «своим» для этой аудитории. */
export function audienceDna(brief: string): Set<GiftDnaAxis> {
  const b = brief.toLowerCase();
  const out = new Set<GiftDnaAxis>();
  const add = (...ax: GiftDnaAxis[]) => ax.forEach((a) => out.add(a));
  if (/врач|медиц|клиник|доктор|стоматолог|медработник|фармац/i.test(b)) add('care', 'relax', 'cozy', 'premium');
  if (/менеджер[а-яё]*\s*по\s*продаж|продажник|онбординг|нов[а-яё]*\s*сотрудник|sales/i.test(b)) add('work', 'travel', 'energy', 'premium');
  if (/разработчик|программист|инженер|it\b|айти|devops|хакатон/i.test(b)) add('tech', 'focus', 'energy', 'work');
  if (/эко|устойчив|переработ|sustainab/i.test(b)) add('eco', 'cozy', 'care');
  if (/спорт|фитнес|wellness|зож|болельщик/i.test(b)) add('sport', 'energy', 'care');
  if (/8\s*март|женщин|девуш|8-е\s*март/i.test(b)) add('cozy', 'relax', 'premium', 'creative');
  if (/премиум|vip|инвестор|luxury|топ[\s-]?менедж|юбилей|руководител/i.test(b)) add('premium', 'work');
  if (/креатив|дизайн|творч/i.test(b)) add('creative', 'cozy');
  if (/зим|новогод|рождеств|тепл/i.test(b)) add('cozy', 'relax', 'care');
  if (/пикник|актив[а-яё]*\s*отдых|outdoor|природ/i.test(b)) add('travel', 'sport', 'cozy');
  return out;
}

/** Явная комплементарность/конфликт пар (сильнее общего DNA-пересечения). Матч по DNA-осям пары. */
const PAIR_SYNERGY: Array<{ a: GiftDnaAxis; b: GiftDnaAxis; score: number }> = [
  { a: 'cozy', b: 'relax', score: 10 },      // плед + чай/аромо — усиливают
  { a: 'cozy', b: 'care', score: 8 },        // плед + бальзам — забота
  { a: 'energy', b: 'work', score: 8 },      // термокружка + ежедневник — рабочее утро
  { a: 'travel', b: 'energy', score: 8 },    // рюкзак + термокружка/повербанк — в дорогу
  { a: 'work', b: 'premium', score: 8 },     // папка/ежедневник + кожа/футляр — статусно
  { a: 'tech', b: 'focus', score: 8 },       // наушники + повербанк — фокус
  { a: 'creative', b: 'cozy', score: 6 },    // скетчбук + уют
  { a: 'eco', b: 'cozy', score: 6 },
  { a: 'sport', b: 'energy', score: 8 },
  // Конфликты — «из разных историй»:
  { a: 'sport', b: 'premium', score: -8 },   // фитнес-резинка рядом с кожаным футляром
  { a: 'sport', b: 'work', score: -6 },
  { a: 'creative', b: 'premium', score: -4 },
];

function pairSynergy(x: Set<GiftDnaAxis>, y: Set<GiftDnaAxis>): number {
  let s = 0;
  for (const { a, b, score } of PAIR_SYNERGY) {
    if ((x.has(a) && y.has(b)) || (x.has(b) && y.has(a))) s += score;
  }
  // Общая совместимость: пары, делящие ≥2 оси — «одна история» (+), полностью чужие (0 общих) — (−).
  const shared = [...x].filter((ax) => y.has(ax)).length;
  if (shared >= 2) s += 6;
  else if (shared === 1) s += 2;
  else if (x.size && y.size) s -= 4; // совсем из разных миров
  return s;
}

export interface CompositionBreakdown {
  total: number;
  cohesion: number;
  synergy: number;
  audience: number;
  dominantAxis: GiftDnaAxis | null;
}

/**
 * Композиционный скор НАБОРА (не суммы товаров): цельность истории (доминирующая ось),
 * попарные синергии/конфликты и соответствие ДНК аудитории. Чем выше — тем сильнее набор
 * «ощущается собранным человеком».
 */
export function scoreComposition(set: CatalogProduct[], audience: Set<GiftDnaAxis>): CompositionBreakdown {
  if (set.length < 2) return { total: 0, cohesion: 0, synergy: 0, audience: 0, dominantAxis: null };
  const dnas = set.map(productDna);

  // 1) ЦЕЛЬНОСТЬ: доля предметов, разделяющих доминирующую ось. Высокая концентрация = одна история.
  const axisCount = new Map<GiftDnaAxis, number>();
  for (const d of dnas) for (const ax of d) axisCount.set(ax, (axisCount.get(ax) ?? 0) + 1);
  let dominantAxis: GiftDnaAxis | null = null;
  let dominantN = 0;
  for (const [ax, n] of axisCount) if (n > dominantN) { dominantN = n; dominantAxis = ax; }
  const cohesion = Math.round((dominantN / set.length) * 30); // 0..30

  // 2) СИНЕРГИИ: средняя попарная совместимость (нормируем на число пар, масштабируем).
  let synSum = 0;
  let pairs = 0;
  for (let i = 0; i < dnas.length; i++)
    for (let j = i + 1; j < dnas.length; j++) { synSum += pairSynergy(dnas[i], dnas[j]); pairs++; }
  const synergy = pairs ? Math.round(synSum / pairs) : 0; // ~ -8..+16

  // 3) АУДИТОРИЯ: доля предметов, попадающих в ДНК аудитории.
  let aud = 0;
  if (audience.size) {
    const hits = dnas.filter((d) => [...d].some((ax) => audience.has(ax))).length;
    aud = Math.round((hits / set.length) * 20); // 0..20
  }
  return { total: cohesion + synergy + aud, cohesion, synergy, audience: aud, dominantAxis };
}

export interface OptimizeCompositionArgs {
  set: CatalogProduct[];
  pool: CatalogProduct[];
  audience: Set<GiftDnaAxis>;
  budgetPerSet: number | null;
  /** Обязательная позиция (mandatory-тип) — не выбрасываем при свопе. */
  isMandatory: (p: CatalogProduct) => boolean;
  /** Свободен ли товар (ledger.canUse) — не занят другим набором. */
  canUse: (p: CatalogProduct) => boolean;
  /** Дублирует ли кандидат роль/категорию уже принятых (кроме заменяемого). */
  dupesRole: (candidate: CatalogProduct, rest: CatalogProduct[]) => boolean;
  /** Минимально достойная цена позиции (не тащить дешёвку). */
  minWorthy?: number;
  /** Максимум свопов (защита от долгого поиска). */
  maxSwaps?: number;
  /** Кандидата МОЖНО свопнуть в набор только если он проходит этот фильтр (напр. архетип-
   *  положительный герой аудитории). Без него keyword-DNA тянет ложные travel-матчи
   *  («органайзер для багажника»). По умолчанию — любой кандидат. */
  accept?: (p: CatalogProduct) => boolean;
  /** Фиксация свопа в реестре ПО ХОДУ поиска (release выброшенного + reserve принятого).
   *  Без этого `canUse` каждой итерации видит СТАЛОЕ состояние (исходный набор): своп,
   *  сделанный на прошлой итерации, не зарезервирован → следующий своп мог втащить кандидата
   *  с тем же line/variant/base-ключом (иной семьи, мимо dupesRole) → внутринаборный дубль,
   *  который реестр обязан не пускать. Если заданы — вызывающий НЕ должен повторно применять
   *  swaps к реестру (они уже зафиксированы). Оба или ни одного. */
  reserve?: (p: CatalogProduct) => void;
  release?: (p: CatalogProduct) => void;
}

/**
 * ЛОКАЛЬНЫЙ ПОИСК КОМПОЗИЦИИ (hill-climb): вместо жадной сборки перебираем замены каждой НЕ-
 * обязательной позиции на кандидата из пула, повышающего КОМПОЗИЦИОННЫЙ скор набора (цельность+
 * синергии+аудитория), в рамках cap/уникальности. Останавливаемся, когда улучшений нет. Это
 * первый шаг к «поиску по пространству композиций» вместо скоринга товаров по отдельности.
 */
export function optimizeComposition(args: OptimizeCompositionArgs): {
  set: CatalogProduct[];
  swaps: Array<{ from: CatalogProduct; to: CatalogProduct }>;
} {
  const { pool, audience, budgetPerSet } = args;
  const minWorthy = args.minWorthy ?? 0;
  const maxSwaps = args.maxSwaps ?? 6;
  const cap = budgetPerSet ?? 0;
  let set = args.set.slice();
  const swaps: Array<{ from: CatalogProduct; to: CatalogProduct }> = [];
  const usedIds = new Set(set.map((p) => p.id));

  for (let iter = 0; iter < maxSwaps; iter++) {
    let best: { i: number; cand: CatalogProduct; gain: number } | null = null;
    const baseScore = scoreComposition(set, audience).total;
    for (let i = 0; i < set.length; i++) {
      const cur = set[i];
      if (args.isMandatory(cur)) continue;
      const rest = set.filter((_, j) => j !== i);
      const totalWithout = rest.reduce((s, x) => s + (x.price ?? 0), 0);
      for (const cand of pool) {
        if (usedIds.has(cand.id) || cand.id === cur.id) continue;
        if (args.accept && !args.accept(cand)) continue;
        if ((cand.price ?? 0) < minWorthy) continue;
        if (cap > 0 && totalWithout + (cand.price ?? 0) > cap) continue;
        if (!args.canUse(cand)) continue;
        if (args.dupesRole(cand, rest)) continue;
        const trial = rest.slice();
        trial.splice(i, 0, cand);
        const gain = scoreComposition(trial, audience).total - baseScore;
        if (gain > 0 && (!best || gain > best.gain)) best = { i, cand, gain };
      }
    }
    if (!best) break;
    const from = set[best.i];
    set = set.map((p, j) => (j === best!.i ? best!.cand : p));
    usedIds.delete(from.id);
    usedIds.add(best.cand.id);
    // Фиксируем своп в реестре СРАЗУ — чтобы `canUse` следующей итерации видел актуальный набор
    // (иначе следующий своп мог втащить line/variant/base-дубль принятого кандидата). Оба
    // колбэка передаются вместе; вызывающий тогда не применяет swaps повторно.
    if (args.release && args.reserve) {
      args.release(from);
      args.reserve(best.cand);
    }
    swaps.push({ from, to: best.cand });
  }
  return { set, swaps };
}
