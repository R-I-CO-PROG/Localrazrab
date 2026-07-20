import type { CatalogProduct } from './catalog.util';
import type { ProductSlot } from './catalog-slot-picker.util';
import { indexCatalogByProductType } from './catalog-slot-picker.util';
import {
  buildBriefRelevanceContext,
  scoreBriefRelevanceWithContext,
  parseBriefForbiddenColors,
  type BriefRelevanceContext,
} from './catalog-brief-relevance.util';
import {
  scoreBrandColorMatch,
  colorCriticalClash,
  isColorCriticalProduct,
  productMatchesRequestedColorFamily,
  productHasForbiddenColor,
} from './catalog-color-match.util';
import {
  hasValidProductImage,
  hasValidProductPrice,
  isLowRelevanceJunk,
} from '../../concept/selection-constraints';
import { familyForType } from '../../concept/product-taxonomy';
import { scoreAudienceNeedsMatch, scoreArchetypeMatch, scoreGiftWorthiness, scoreDesirability, scoreConceptCoherence } from './catalog-context-scoring.util';
import { detectConceptProductType, OPTIONAL_TYPE_MAX_CONCEPTS } from './concept-diversity.util';
import { productMatchesForbidden } from './catalog-forbidden-match.util';
import { productFulfillsTirage } from './catalog-fulfillment.util';
import type { SelectionLedger } from './catalog-selection-ledger';
import type { ShortlistContext, SlotShortlist } from './catalog-neural-selector.types';
import { productMatchesMaterial } from './material-match.util';

const DEFAULT_PER_SLOT_SIZE = 20;

/** Товары, почти никогда не уместные в подарочном НАБОРЕ, если бриф их прямо не просит:
 *  награды/медали/кубки/дипломы (это для церемоний, не подарок) и novelty-шум. */
function isNeverInGiftSet(p: CatalogProduct, brief: string): boolean {
  const n = (p.name ?? '').toLowerCase();
  const b = (brief ?? '').toLowerCase();
  const isAward = /(?<![а-яё])(награ|медал|кубок|орден|грамот|диплом)[а-яё]*/.test(n);
  const briefWantsAward = /(награ|медал|кубок|орден|грамот|диплом|номинац|церемони|конкурс|соревнов|победител|чемпион)/.test(b);
  if (isAward && !briefWantsAward) return true;
  if (/(кремл|диет)[а-яё]*/.test(n) && !/(диет|кух|готов|здоров|еда|кулинар)/.test(b)) return true;
  // Гендерное несоответствие одежды: мужское в подарке женщинам и наоборот.
  const forWomen = /(женщ|девуш|\bдам|подруг|8\s*март|\bмам|сестр|её|ей\b)/.test(b);
  const forMen = /(мужчин|джентльм|\bпап|\bотц|23\s*фев|защитник)/.test(b);
  if (forWomen && /(?<![а-яё])мужск[а-яё]*/.test(n)) return true;
  if (forMen && /(?<![а-яё])женск[а-яё]*/.test(n)) return true;
  // ДЕТСКИЕ товары (одежда/игрушки) в подарке ВЗРОСЛОЙ аудитории — грубый промах релевантности
  // (судья: «детская футболка совершенно не соответствует женщинам-сотрудницам»). Пускаем только
  // если бриф явно про детей/семью/школу.
  const briefForKids = /детск|для\s*детей|ребён|ребен|(?<![а-яё])дет[еяи]|школьник|малыш|семейн|для\s*всей\s*семьи/.test(b);
  if (!briefForKids && /(?<![а-яё])детск[а-яё]*/.test(n)) return true;
  // ПРАЗДНИЧНАЯ АТРИБУТИКА не по поводу: новогодний/рождественский декор (ёлки/олени/Дед Мороз)
  // в НЕ-новогоднем брифе — грубый промах (судья: «врачам не нужны свечи с оленями и ёлками»).
  const briefIsWinterHoliday = /новогодн|нов[а-яё]*\s*год|рождеств|зимн|(?<![а-яё])[её]лк/.test(b);
  if (!briefIsWinterHoliday && /новогодн|рождеств|[её]лочн|(?<![а-яё])[её]лк[аи]|дед\s*мороз|снегур|санта[\s-]?клаус|адвент/.test(n)) return true;
  return false;
}

/**
 * Термин-исключение → типы (slug) товаров этого семейства. Нужно, чтобы «Ежедневники»
 * ловило diary/notebook даже когда категория обобщённая (подарочный набор с ежедневником),
 * а «Ручки» — только настоящие ручки, а НЕ «сумку с ручками» (по имени не матчим).
 */
const EXCLUSION_SLUG_RULES: Array<{ re: RegExp; slugs: Set<string> }> = [
  { re: /ежедневн|дневник|блокнот|планер|planner|diary|notebook/, slugs: new Set(['diary', 'notebook', 'calendar']) },
  { re: /ручк|роллер|карандаш|маркер|pencil|(?<![а-яё])pen(?![а-яё])/, slugs: new Set(['pen', 'pencil']) },
  { re: /одежд|футболк|худи|свитшот|толстовк|поло|лонгслив|рубашк|джемпер|кофт|apparel/, slugs: new Set(['tshirt', 'hoodie', 'raincoat', 'scarf', 'socks']) },
  { re: /кружк|термокруж|термос|термостакан|стакан|бутыл|посуд|чайн|mug|drinkware/, slugs: new Set(['mug', 'bottle', 'thermos', 'thermos_mug', 'tumbler', 'tea_set']) },
  { re: /сумк|рюкзак|шоппер|чемодан|bag|backpack/, slugs: new Set(['bag', 'backpack', 'shopper', 'suitcase']) },
  { re: /зонт|umbrella/, slugs: new Set(['umbrella']) },
  { re: /powerbank|повербанк|пауэрбанк|пауэр|аккумулятор|зарядн/, slugs: new Set(['powerbank']) },
  { re: /колонк|speaker|акустик|bluetooth/, slugs: new Set(['speaker']) },
  { re: /наушник|headphone|earbud|tws/, slugs: new Set(['tech_accessory']) },
  { re: /космет/, slugs: new Set(['cosmetic_bag']) },
  { re: /полотенц|towel/, slugs: new Set(['towel']) },
  { re: /плед|blanket/, slugs: new Set(['blanket']) },
  { re: /свеч|candle/, slugs: new Set(['candle']) },
  { re: /часы|watch/, slugs: new Set(['watch']) },
];

/**
 * Исключён ли товар по брифу «Исключения». Матчим по КАТЕГОРИИ-бакету и по ТИПУ-slug,
 * НЕ по сырому имени (иначе «сумка с ручками» ложно попадает под запрет «ручки»).
 */
export function isExcluded(p: CatalogProduct, excluded?: string[]): boolean {
  if (!excluded?.length) return false;
  // СИЛЬНЫЙ матчер (стем/семейства-синонимы/кириллица+латиница по name+описанию+категории) —
  // ловит свободнотекстовые чипы «пауэр банки»/«колонки беспроводные»/«аккумуляторы», которые
  // slug/категория-логика ниже пропускала (мис-типизация, латиница). UNION: старую логику
  // сохраняем для КОРОТКИХ терминов вроде «ручки» (стем <5 → матч по имени дал бы «сумку с ручками»).
  if (productMatchesForbidden(p, excluded)) return true;
  const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');
  const cat = `${norm(p.category)} ${norm(p.subcategory)}`;
  const catWords = cat.split(/[^а-яa-z0-9]+/i).filter((w) => w.length >= 3);
  const slug = detectConceptProductType(p);
  for (const exRaw of excluded) {
    const ex = norm(exRaw).trim();
    if (ex.length < 3) continue;
    // 1) категория-бакет содержит термин, ИЛИ термин содержит имя бакета
    //    («ежедневники» ⊃ бакет «ежедневники и блокноты»).
    if (cat.includes(ex) || catWords.some((w) => ex.includes(w))) return true;
    // 2) тип-slug из семейства-исключения (обобщённая категория, но тип diary/pen/…).
    for (const rule of EXCLUSION_SLUG_RULES) {
      if (rule.slugs.has(slug) && rule.re.test(ex)) return true;
    }
  }
  return false;
}

/** Лёгкий гейт: только жёсткая валидность (картинка/цена/бюджет/исключения/реестр). */
/** Запрещённые брифом цвета («без красного») — parseBriefForbiddenColors регексповая, а гейт
 *  зовётся на каждый из десятков тысяч кандидатов. Мемоизируем по тексту брифа. */
const forbiddenColorCache = new Map<string, string[]>();
export function briefForbiddenColorHints(brief: string): string[] {
  let hints = forbiddenColorCache.get(brief);
  if (hints === undefined) {
    hints = parseBriefForbiddenColors(brief);
    if (forbiddenColorCache.size > 200) forbiddenColorCache.clear();
    forbiddenColorCache.set(brief, hints);
  }
  return hints;
}

function passesGateLight(
  p: CatalogProduct,
  ctx: ShortlistContext,
  ledger: SelectionLedger,
): boolean {
  if (!hasValidProductImage(p)) return false;
  if (!hasValidProductPrice(p)) return false;
  if (isExcluded(p, ctx.excludedItems)) return false;
  if (isNeverInGiftSet(p, ctx.brief)) return false;
  // Цвето-критичный товар (плед/сумка/зонт/одежда/посуда) в ЯВНО чужом цвете — НЕ пускаем
  // даже в последний добор: для красного бренда не должно быть фуксии/тёмно-синего пледа.
  // Нейтраль и не-цветокритичное (электроника) проходят. brandColors берём из ctx.
  if (!ctx.relaxColorClash && colorCriticalClash(p, ctx.brandColors)) return false;
  // ЯВНО ЗАПРЕЩЁННЫЙ БРИФОМ ЦВЕТ («без красного») — жёстко и для ЛЮБОГО типа товара. Раньше цвет
  // жил только в скоринге и в терминальном бэкстопе, поэтому LLM-байер видел пул, полный
  // запрещённо-цветных SKU, и «выбирал» их — а бэкстоп потом молча вырезал и добирал заново.
  if (productHasForbiddenColor(p, briefForbiddenColorHints(ctx.brief))) return false;
  if (ctx.budgetPerSet != null && ctx.budgetPerSet > 0) {
    const price = p.price ?? 0;
    if (price > ctx.budgetPerSet) return false;
  }
  return ledger.canUse(p);
}

/** Полный гейт = лёгкий + отсев нерелевантного мусора по брифу. */
function passesGate(
  p: CatalogProduct,
  ctx: ShortlistContext,
  ledger: SelectionLedger,
): boolean {
  if (!passesGateLight(p, ctx, ledger)) return false;
  return !isLowRelevanceJunk(p, ctx.brief);
}

/**
 * Штраф за нереализуемость (остаток < тираж). Штраф-только, без «бонуса за наличие»:
 * держим ниже типичного разрыва релевантности (30+), чтобы реализуемость решала СРЕДИ
 * сравнимо-релевантных, а не перебивала релевантность и не инфлировала базовый скор.
 */
export const FULFILLMENT_SHORTFALL_PENALTY = -18;

/** Порог «жёстко зарезанного» товара: reject-правила дают −120…−220; всё ниже −70 — это
 *  «не в этот бриф» (ножи для сыра онбордингу, скакалка врачу), в резерв добора не пускаем. */
const RELAX_HARD_REJECT_FLOOR = -70;

/** Потолок положительной части keyword-релевантности в scoreRow: не даёт keyword-stuffing
 *  доминировать над semanticFit и заодно ограничивает вклад premium-theme (тройной премиум-счёт). */
const BASE_POSITIVE_CAP = 70;

/** Вес semanticFit (±0.15) в scoreRow. ×120 (было ×100) — семантика теперь конкурирует с
 *  клампнутой keyword-базой (≤70), но по модулю остаётся < variety-cap (−150), не воскрешая
 *  заблокированные семейства. ×155 переусиливал (зарядки-врачу в 4 набора) — 120 безопаснее. */
const SEMANTIC_WEIGHT = 120;

/**
 * Ценовой сигнал позиции (цена=ценность). Асимметричная кривая вокруг цены-на-предмет
 * (target = 1/expectedItems от бюджета набора):
 *  - дешевле target — линейный подъём к пику;
 *  - дороже target — ПЛАТО (не обнуляем): дорогое качество не должно быть хуже дешёвки —
 *    иначе набор недобирает бюджет, а 3b не может апгрейдить к дорогому валидному аналогу;
 *  - ниже value-floor — МЯГКИЙ штраф-сигнал (не отсев): режет копеечный несерьёзный филлер
 *    (брелок/антистресс), но на малом бюджете (врачи 800₽) не выкашивает легитимные позиции.
 * По модулю строго < variety-cap (−150), чтобы не воскрешать заблокированные семейства.
 */
export function scorePriceCurve(
  price: number,
  budgetPerSet: number,
  expectedItems: number,
  premium: boolean,
): number {
  if (!(budgetPerSet > 0) || !(price > 0)) return 0;
  const frac = price / budgetPerSet;
  const ei = Math.max(2, Math.min(8, Math.round(expectedItems || 5)));
  const lo = premium ? 0.18 : 0.12;
  const target = Math.max(lo, Math.min(0.45, 1 / ei));
  let s = 0;
  const valueFloor = premium ? Math.min(700, budgetPerSet * 0.2) : Math.min(450, budgetPerSet * 0.15);
  if (price < valueFloor) s -= Math.min(16, ((valueFloor - price) / valueFloor) * 16);
  const dev = frac - target;
  if (dev >= 0) s += Math.max(4, 12 - dev * 8);
  else s += 12 * (frac / target);
  return s;
}

/** Скоринг кандидата: релевантность брифу + совпадение бренд-цветов + близость к доле бюджета.
 *  Экспортирован для юнит-теста клампа semanticFit (G4, пере-скан). */
/**
 * Сортировка по scoreRow по УБЫВАНИЮ с мемоизацией: scoreRow (regex-тяжёлая — productText +
 * десятки regex-тестов) считается ПО ОДНОМУ разу на строку, а не O(n·log n) раз в компараторе
 * (каждое сравнение звало scoreRow дважды). Сортирует и возвращает тот же массив.
 */
export function sortByScoreDesc(
  rows: CatalogProduct[],
  relCtx: BriefRelevanceContext,
  ctx: ShortlistContext,
): CatalogProduct[] {
  const cache = new Map<CatalogProduct, number>();
  const s = (p: CatalogProduct): number => {
    let v = cache.get(p);
    if (v === undefined) {
      v = scoreRow(p, relCtx, ctx);
      cache.set(p, v);
    }
    return v;
  };
  return rows.sort((a, b) => s(b) - s(a));
}

export function scoreRow(
  p: CatalogProduct,
  relCtx: BriefRelevanceContext,
  ctx: ShortlistContext,
): number {
  let score = scoreBriefRelevanceWithContext(p, relCtx);
  // КЛАМП keyword-базы (только положительной части): базовая релевантность неограничена
  // (+6/токен + theme-бонусы до +60), поэтому «мусор с удачным неймингом» (много брифовых токенов
  // в названии/описании) набирал 100+ и топил семантически-профильный товар со скромным именем, но
  // высоким semanticFit (±15). Кламп на 70 сохраняет сильные reject-негативы (проходят как есть) и
  // легитимную тему, но не даёт keyword-stuffing доминировать над смыслом. Также ограничивает вклад
  // premium-theme (часть тройного премиум-счёта).
  if (score > 0) score = Math.min(BASE_POSITIVE_CAP, score);
  if (ctx.brandColors.length) {
    // Цвето-критичные товары (одежда/сумки/зонты/плед/посуда) сильнее тянем к бренд-цвету;
    // у нейтральных/электроники вес меньше (цвет у них вторичен).
    const w = isColorCriticalProduct(p) ? 0.9 : 0.4;
    score += scoreBrandColorMatch(p, ctx.brandColors) * w;
  }
  // Ценовой сигнал (цена=ценность): асимметричная кривая вокруг цены-на-предмет набора.
  if (ctx.budgetPerSet != null && ctx.budgetPerSet > 0) {
    const premium = relCtx.flags?.premium === true;
    score += scorePriceCurve(p.price ?? 0, ctx.budgetPerSet, ctx.expectedItems ?? 5, premium);
  }
  // Потребности аудитории (визитница продажнику, плед врачу). ≤ AUDIENCE_CAP, < variety −150.
  score += scoreAudienceNeedsMatch(p, ctx.audienceNeeds);
  // СВЯЗНОСТЬ С ТЕМОЙ КОНЦЕПЦИИ: +тематичный, −ломающий вайб (рюкзак в «уюте», зонт в «работе»).
  // ЕДИНСТВЕННЫЙ канал темы: раньше тема считалась ДВАЖДЫ — scoreConceptThemeMatch (+18, внутри
  // scoreContextBonus) И scoreConceptCoherence (+24) на ОДНОМ предикате (axis.titleKey &&
  // axis.productMatch), суммарно +42 за один сигнал. Coherence сильнее (24>18) и добавляет
  // штраф-ветку, поэтому themeMatch избыточен — убран из scoreRow. По модулю < variety −150.
  score += scoreConceptCoherence(p, ctx.conceptTitle, ctx.conceptComposition);
  // СЕМАНТИКА: fit к интенту подарка аудитории (cos+ − cos−), ±0.15 → ±15. Различает смысл там,
  // где keyword слеп («документов» vs «багажника»). Сбалансированный вес: ×155 переусиливал пул
  // (зарядки-врачу в 4 набора → повтор). По модулю < variety −150.
  // КЛАМП (G4, пере-скан): fit = cos⁺−cos⁻ математически НЕ ограничен ±0.15 (разность двух
  // косинусных близостей теоретически до ±2) — комментарий выше описывает ТИПИЧНЫЙ, но не
  // гарантированный диапазон. Без клампа редкий выброс (битый вектор/дрейф модели) мог бы дать
  // score сотни пунктов, перебивая variety-cap (−150) и другие сигналы. Клампим к заявленному ±0.15.
  if (p.semanticFit != null) {
    score += Math.max(-0.15, Math.min(0.15, p.semanticFit)) * SEMANTIC_WEIGHT;
  }
  // Архетип подарка концепции: целевой тип истории (+), сувенирная дешёвка по типу (−). Плюс
  // name-based «подарочность»: штраф сувенирным формам (флешка-в-виде-X, обложка паспорта,
  // антистресс) во всех брифах. Оба по модулю < variety −150.
  score += scoreArchetypeMatch(p, ctx.archetype, ctx.budgetPerSet) + scoreGiftWorthiness(p) + scoreDesirability(p);
  // МАТЕРИАЛ НАБОРА («полностью кожаный») — сильное предпочтение, но НЕ жёсткий отсев: бонус
  // сравним по модулю с архетипом/аудиторией (< variety −150), чтобы кожаный вариант побеждал
  // при прочих равных внутри уже тематически подходящих кандидатов, но НЕ перебивал явный
  // анти-фит по аудитории/архетипу (иначе снова получим кожаную косметичку строителю).
  if (ctx.requiredMaterial && productMatchesMaterial(p, ctx.requiredMaterial)) {
    score += 40;
  }
  // Мягкий межконцептовый анти-однообразие: если семейство уже было в ≥2 наборах —
  // штрафуем (плед/сумка/зонт не должны быть во всех 5). НЕ жёсткий отсев (контракт).
  if (ctx.familyUsage && ctx.familyUsage.size) {
    const fam = familyForType(detectConceptProductType(p));
    // Обязательные типы штраф НЕ трогает — контракт даёт им лимит 5 (иначе штраф −150 боролся
    // бы со вставкой mandatory). Проверяем семейство против mandatoryTypes брифа.
    const isMandatoryFam = ctx.mandatoryTypes?.some((t) => familyForType(t) === fam) ?? false;
    if (!isMandatoryFam) {
      const used = ctx.familyUsage.get(fam) ?? 0;
      // Тип, уже бывший в OPTIONAL_TYPE_MAX_CONCEPTS наборах, — фактически в конец пула
      // (жёсткий штраф ≫ разрыва релевантности): футболка/флешка/ежедневник не в 3–4 из 5.
      if (used >= OPTIONAL_TYPE_MAX_CONCEPTS) score -= 150;
      else if (used === 1) score -= 12;
    }
  }
  // РЕАЛИЗУЕМОСТЬ: при заданном тираже товар, который НЕЛЬЗЯ отгрузить (остаток < тираж),
  // получает ШТРАФ. Штраф-только (а не ±бонус): (1) не инфлирует базовый скор нерелевантного
  // in-stock товара выше тематического порога, (2) остаётся ниже типичного разрыва
  // релевантности (30+), поэтому НЕ перебивает релевантность в one-key сортировках —
  // реализуемость решает среди сравнимо-релевантных, а не тащит off-theme «лишь бы на складе».
  if (ctx.tirage != null && ctx.tirage > 0 && !productFulfillsTirage(p, ctx.tirage)) {
    score += FULFILLMENT_SHORTFALL_PENALTY;
  }
  return score;
}

/**
 * Ретривал: сужает каталог (51k) до шортлиста реальных валидных SKU под каждый слот.
 * Финальный выбор тут НЕ делается — только ограничивается множество вариантов для
 * нейро-байера и детерминированного добора. Никогда не бросает исключений.
 */
export function buildSlotShortlists(
  slots: ProductSlot[],
  catalog: CatalogProduct[],
  ctx: ShortlistContext,
  ledger: SelectionLedger,
): SlotShortlist[] {
  const perSlot = ctx.perSlotSize ?? DEFAULT_PER_SLOT_SIZE;
  const relCtx = buildBriefRelevanceContext(ctx.brief, ctx.brandColors);
  let typeIndex: Map<string, CatalogProduct[]>;
  try {
    typeIndex = indexCatalogByProductType(catalog);
  } catch {
    typeIndex = new Map();
  }

  return slots.map((slot) => {
    try {
      const byType = typeIndex.get(slot.type) ?? [];
      let rows = byType.filter((p) => passesGate(p, ctx, ledger));
      // Тип не дал кандидатов (бедный каталог) — добираем релевантностью по всему каталогу.
      if (rows.length < 3) {
        const extra = catalog
          .filter((p) => passesGate(p, ctx, ledger))
          .filter((p) => !rows.some((r) => r.id === p.id));
        rows = rows.concat(extra);
      }
      sortByScoreDesc(rows, relCtx, ctx);
      return { slot, candidates: rows.slice(0, perSlot) };
    } catch {
      return { slot, candidates: [] };
    }
  });
}

/**
 * Богатый пул кандидатов на ВСЮ концепцию (не по слотам): релевантные брифу, в бюджете,
 * валидные, КАТЕГОРИАЛЬНО-РАЗНООБРАЗНЫЕ (cap на категорию — чтобы не было 48 сумок/новелти).
 * Умный байер сам соберёт связный набор из этого пула — это снимает зависимость от
 * (часто плохих) типов-слотов идеатора и слабого rule-скорера релевантности.
 */
export function buildConceptPool(
  catalog: CatalogProduct[],
  broadCatalog: CatalogProduct[],
  ctx: ShortlistContext,
  ledger: SelectionLedger,
  opts: { size?: number; perCategoryCap?: number; minCategories?: number; mandatoryPerType?: number } = {},
): CatalogProduct[] {
  const size = opts.size ?? 48;
  const perCategoryCap = opts.perCategoryCap ?? 3;
  const minCategories = opts.minCategories ?? 6;
  const relCtx = buildBriefRelevanceContext(ctx.brief, ctx.brandColors);
  try {
    const out: CatalogProduct[] = [];
    const catCount = new Map<string, number>();
    const have = new Set<string>();
    const add = (p: CatalogProduct) => {
      catCount.set(p.category || 'other', (catCount.get(p.category || 'other') ?? 0) + 1);
      have.add(p.id);
      out.push(p);
    };
    const distinctCats = () => new Set(out.map((p) => p.category || 'other')).size;

    // Проход 0: ОБЯЗАТЕЛЬНЫЕ типы, названные в брифе («повербанк», «зонт»…). Гарантируем их
    // присутствие в пуле ТОЧНЫМ поиском по типу — даже если rule-релевантность их не подняла бы
    // и даже минуя per-category cap. Сначала релевантный каталог, потом широкий; лёгкий гейт
    // (картинка/цена/бюджет/исключения) без relevance-фильтра, иначе на кратком брифе «жёлтые
    // повербанки» единственный валидный повербанк вырезался как «нетематичный».
    const mandatoryTypes = ctx.mandatoryTypes ?? [];
    if (mandatoryTypes.length) {
      const perType = opts.mandatoryPerType ?? 4;
      for (const type of mandatoryTypes) {
        let cands = catalog.filter(
          (p) => !have.has(p.id) && detectConceptProductType(p) === type && passesGateLight(p, ctx, ledger),
        );
        if (cands.length < perType) {
          const extra = broadCatalog.filter(
            (p) =>
              !have.has(p.id) &&
              !cands.some((c) => c.id === p.id) &&
              detectConceptProductType(p) === type &&
              passesGateLight(p, ctx, ledger),
          );
          cands = cands.concat(extra);
        }
        if (!cands.length) {
          // Бюджет-гейт мог вырезать ВСЕ SKU обязательного типа (проектор за 7840 при
          // бюджете набора 5000) — обязательность важнее гейта: льготный проход без
          // бюджета, иначе тип молча пропадает из пула и из набора.
          const noBudgetCtx: ShortlistContext = { ...ctx, budgetPerSet: null };
          const seen = new Set<string>();
          cands = [...catalog, ...broadCatalog].filter((p) => {
            if (have.has(p.id) || seen.has(p.id)) return false;
            seen.add(p.id);
            return (
              detectConceptProductType(p) === type && passesGateLight(p, noBudgetCtx, ledger)
            );
          });
        }
        // Если бриф просит цвет («жёлтый повербанк»), пиннуем цвет-совпавшие варианты
        // ПЕРВЫМИ — чтобы у байера был жёлтый SKU, а не только чёрный/дефолтный.
        // Ещё раньше цвета — покрытие тиража: при тираже 155 проектор со стоком 445
        // полезнее флагмана со стоком 1.
        const tirage = ctx.tirage ?? 0;
        // scoreRow тяжёлая — считаем ПО РАЗУ на кандидата (тай-брейк в компараторе иначе звал бы
        // её O(n·log n) раз).
        const rowScore = new Map<CatalogProduct, number>();
        const sr = (p: CatalogProduct): number => {
          let v = rowScore.get(p);
          if (v === undefined) { v = scoreRow(p, relCtx, ctx); rowScore.set(p, v); }
          return v;
        };
        cands.sort((a, b) => {
          if (tirage > 0) {
            const sa = (a.stockAvailable ?? 0) >= tirage ? 1 : 0;
            const sb = (b.stockAvailable ?? 0) >= tirage ? 1 : 0;
            if (sa !== sb) return sb - sa;
          }
          if (ctx.brandColors.length) {
            // Строгое семейство (жёлтый ≠ оранжевый) — главный приоритет.
            const fa = productMatchesRequestedColorFamily(a, ctx.brandColors) ? 1 : 0;
            const fb = productMatchesRequestedColorFamily(b, ctx.brandColors) ? 1 : 0;
            if (fa !== fb) return fb - fa;
            const cd = scoreBrandColorMatch(b, ctx.brandColors) - scoreBrandColorMatch(a, ctx.brandColors);
            if (Math.abs(cd) > 1) return cd;
          }
          return sr(b) - sr(a);
        });
        for (const p of cands.slice(0, perType)) {
          if (out.length >= size) break;
          add(p);
        }
      }
    }

    // Проход 1: РЕЛЕВАНТНЫЕ брифу (полный гейт), с лимитом на категорию.
    const onBrief = sortByScoreDesc(catalog.filter((p) => passesGate(p, ctx, ledger)), relCtx, ctx);
    for (const p of onBrief) {
      if (out.length >= size) break;
      if ((catCount.get(p.category || 'other') ?? 0) >= perCategoryCap) continue;
      add(p);
    }

    // Проход 2: ДИВЕРСИФИКАЦИЯ. Если пул монокатегорийный (бедный нишевый бриф —
    // эко=сумки), добавляем товары ДРУГИХ категорий по лёгкому гейту, чтобы у байера
    // был выбор и набор не вышел «склад сумок». Рич-брифы это не трогает (у них уже
    // много категорий).
    if (distinctCats() < minCategories) {
      const haveCats = new Set(out.map((p) => p.category || 'other'));
      // Диверсификация из ШИРОКОГО каталога (не из узкого relevance-пула, иначе для эко
      // там опять одни сумки). Берём ТЕМАТИЧНЫЕ товары ДРУГИХ категорий — иначе в нишевый
      // пул льются увлажнители/лампы/метеостанции «ради разнообразия». Порог — по ЧИСТОЙ
      // релевантности (не scoreRow!), чтобы тираж/цвет/бюджет-бонусы не протаскивали
      // off-theme товар только за наличие на складе.
      let light = broadCatalog.filter(
        (p) =>
          !have.has(p.id) &&
          passesGateLight(p, ctx, ledger) &&
          scoreBriefRelevanceWithContext(p, relCtx) > 0,
      );
      // Контракт-страховка: если тематичных нет — берём любые валидные (бедный каталог).
      if (light.length === 0) {
        light = broadCatalog.filter((p) => !have.has(p.id) && passesGateLight(p, ctx, ledger));
      }
      sortByScoreDesc(light, relCtx, ctx);
      for (const p of light) {
        if (out.length >= size || distinctCats() >= minCategories) break;
        const c = p.category || 'other';
        if (haveCats.has(c)) continue; // берём только НОВЫЕ категории
        add(p);
        haveCats.add(c);
      }
      // ещё немного «глубины» по уже добавленным новым категориям (до cap).
      for (const p of light) {
        if (out.length >= size) break;
        const c = p.category || 'other';
        if ((catCount.get(c) ?? 0) >= perCategoryCap) continue;
        if (!have.has(p.id)) add(p);
      }
    }

    // Проход 3: добор до size без лимита (на случай бедного каталога).
    if (out.length < size) {
      for (const p of onBrief) {
        if (out.length >= size) break;
        if (!have.has(p.id)) add(p);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Расширенный шортлист для добора (релаксация): игнорирует фильтр по типу,
 * ранжирует весь каталог релевантностью, исключая уже занятые id.
 */
export function relaxShortlist(
  slot: ProductSlot,
  catalog: CatalogProduct[],
  ctx: ShortlistContext,
  ledger: SelectionLedger,
  exclude: Set<string>,
): CatalogProduct[] {
  const perSlot = ctx.perSlotSize ?? DEFAULT_PER_SLOT_SIZE;
  const relCtx = buildBriefRelevanceContext(ctx.brief, ctx.brandColors);
  try {
    // ЛЁГКИЙ гейт: мягко-нетематичное пропускаем (последний рубеж добора — лучше валидный
    // менее тематичный товар, чем пустой набор). НО жёстко-ЗАРЕЗАННОЕ (reject ≤ −70: ножи для
    // сыра/новогодний плед/гольф/скакалка врачу) НЕ пускаем даже в резерв — иначе блок-2 добора
    // (до minItems, без relevance-проверки) тащит его в набор мимо всех фильтров.
    const relaxed = catalog.filter(
      (p) => !exclude.has(p.id) && passesGateLight(p, ctx, ledger) && scoreBriefRelevanceWithContext(p, relCtx) > RELAX_HARD_REJECT_FLOOR,
    );
    // Фолбэк: если жёсткий фильтр выкосил всё (совсем нишевый бриф) — возвращаемся к лёгкому гейту.
    const base = relaxed.length ? relaxed : catalog.filter((p) => !exclude.has(p.id) && passesGateLight(p, ctx, ledger));
    return sortByScoreDesc(base, relCtx, ctx).slice(0, perSlot);
  } catch {
    return [];
  }
}
