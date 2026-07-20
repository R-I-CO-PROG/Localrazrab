import type { CatalogProduct } from './catalog.util';
import { detectConceptProductType } from './concept-diversity.util';
import { matchProductAttributes } from './product-attributes.util';
import {
  productMatchesRequestedColorFamily,
  productHasForbiddenColor,
  colorCriticalClash,
} from './catalog-color-match.util';
import { parseBriefForbiddenColors } from './catalog-brief-relevance.util';
import { productVariantKey, productLineKeyFromName } from './catalog-variant.util';
import { scoreDesirability } from './catalog-context-scoring.util';
import { hasValidProductImage } from '../../concept/selection-constraints';
import { productMatchesForbidden } from './catalog-forbidden-match.util';
import { productMatchesNamedPosition, type NamedPositionSpec } from '../../requests/named-positions.util';
import { productMatchesMaterial } from './material-match.util';

/**
 * Признаки НАБОРА/аудитории/повода → это НЕ точечный запрос товара, а подарочный набор.
 * ГОЛОЕ «подарок/подарочный» СЮДА НЕ входит: «термокружка белая в подарок» — точечный запрос, а
 * не набор (реальные наборы ловятся по «набор/комплект» и аудитории/поводу). «день X» — только
 * конкретные поводы, чтобы «кружка на день кофе» не считалось набором.
 */
const SET_SIGNALS =
  /набор|компл[еи]кт|подар(?:очн[а-я]*\s+(?:набор|компл|бокс|box|коробк)|ит[еь])|сотрудник|(?<![а-я])работник|персонал|команд|коллег|клиент|партн[еo]р|врач|учител|педагог|менеджер[а-я]*\s+по|welcome|онбординг|8\s*март|23\s*фев|новогодн|нов[а-я]{1,3}\s*год|рождеств|д(?:ень|ню|ня)\s+(?:рожд|учител|врач|матер|отц|защитник|город|компан|нефтян|строител|медик|энергетик|пожарн|полиц|воспитател|бухгалтер|програм|снабжен|hr)|юбилей|тимбилдинг|каждому|подчин[её]нн|гост[яеями]|аудитор|коллектив|(?<![а-я])мерч(?![а-я])|праздник|корпоратив|конференц|фестивал|выставк|для\s+(?:всей\s+)?команд|студент|молод[её]ж|выпускн|тематическ[а-я]*\s+набор/i;

/**
 * САМООПРЕДЕЛЕНИЕ БРИФА: точечный запрос ОДНОГО конкретного товара («белый повербанк на 5000 мАч»,
 * «оранжевые полотенца») vs подбор набора-подарка. Для точечного запроса идеатор не нужен — ищем
 * сразу по каталогу и отдаём ВЫБОРКУ подходящих товаров (топ-N разных вариантов = N концепций).
 *
 * Точечный = ровно ОДИН именованный тип + НЕТ признаков набора/аудитории/повода. Длина брифа, кол-во
 * товаров и лимит количества НЕ важны: при точечном запросе явное число трактуется как «сколько
 * КОНЦЕПЦИЙ показать» (по одному товару в каждой), а не «сколько позиций в наборе» — поэтому «вентилятор»
 * с лимитом 5 = 5 концепций-вентиляторов, а не набор из 5 позиций с вентилятором-якорем. Набор с
 * якорем возникает только когда есть SET_SIGNALS (там isSingle=false → идёт идеатор/anchor-когерентность).
 */
/** Есть ли в брифе признаки НАБОРА/аудитории/повода (тогда это точно не точечный запрос товара). */
export function hasSetSignals(brief: string): boolean {
  return SET_SIGNALS.test((brief || '').toLowerCase().replace(/ё/g, 'е'));
}

export function isSingleProductBrief(brief: string, namedTypes: string[]): boolean {
  if (namedTypes.length !== 1) return false;
  // Один тип + нет набора/аудитории/повода → точечный запрос товара (число = число концепций).
  return !hasSetSignals(brief);
}

/**
 * СЛОВАРЬ ТОВАРОВ для само-определения точечного запроса. Каталожная slug-таксономия
 * (detectConceptProductType) заточена под ИМЕНА товаров, а resolveNamedItemsForBrief знает лишь
 * малую часть типов — поэтому свой явный словарь: тип по тексту брифа. Порядок = специфичность
 * (термокружка раньше кружки). family — для проверки «ровно ОДНО семейство» (термокружка = кружка =
 * drinkware → один товар; полотенце + плед = 2 семейства → это набор, не точечный запрос).
 * nameRe используется и в поиске по каталогу (матч по имени, когда slug-таксономия даёт другой тип).
 */
const PRODUCT_KEYWORDS: Array<{ slug: string; family: string; term: string; re: RegExp }> = [
  { slug: 'thermos_mug', family: 'drinkware', term: 'термокружка', re: /термокруж|термо[\s-]?кружк|travel\s*mug/i },
  { slug: 'thermos', family: 'drinkware', term: 'термос', re: /(?<![а-я])термос(?![а-я])/i },
  { slug: 'mug', family: 'drinkware', term: 'кружка', re: /(?<![а-я])кружк|(?<![a-z])mug(?![a-z])/i },
  { slug: 'bottle', family: 'drinkware', term: 'бутылка', re: /(?<![а-я])бутыл|шейкер|(?<![а-я])фляг/i },
  { slug: 'tumbler', family: 'drinkware', term: 'стакан', re: /(?<![а-я])стакан|тамблер|тумблер/i },
  { slug: 'powerbank', family: 'tech', term: 'внешний аккумулятор', re: /повербанк|пауэрбанк|power\s*bank|внешн[а-я]*\s*аккумул|(?<![а-я])аккумулятор/i },
  { slug: 'headphones', family: 'tech', term: 'наушники', re: /наушник|гарнитур|(?<![a-z])tws(?![a-z])|earbud/i },
  { slug: 'speaker', family: 'tech', term: 'колонка', re: /(?<![а-я])колонк|(?<![а-я])спикер|саундбар/i },
  { slug: 'flash', family: 'tech', term: 'флешка', re: /(?<![а-я])флешк|флеш[\s-]?накопит|usb[\s-]?флеш|флеш[\s-]?карт/i },
  { slug: 'mousepad', family: 'tech', term: 'коврик для мыши', re: /коврик\s*для\s*мыш/i },
  { slug: 'usb_hub', family: 'tech', term: 'usb хаб', re: /usb[\s-]?хаб|(?<![а-я])хаб(?![а-я])/i },
  { slug: 'cable', family: 'tech', term: 'кабель', re: /(?<![а-я])кабель|(?<![а-я])провод(?![а-я])/i },
  { slug: 'charger', family: 'tech', term: 'зарядное устройство', re: /зарядн[а-я]*\s*устройств|беспроводн[а-я]*\s*заряд|(?<![а-я])бзу(?![а-я])/i },
  { slug: 'lamp', family: 'tech', term: 'лампа', re: /(?<![а-я])лампа|ночник|светильник/i },
  { slug: 'fan', family: 'climate', term: 'вентилятор', re: /вентилятор|(?<![а-я])вентик(?![а-я])/i },
  { slug: 'watch', family: 'tech', term: 'часы', re: /(?<![а-я])часы(?![а-я])|smart\s*watch|смарт[\s-]?час|наручн[а-я]*\s*час/i },
  { slug: 'phone_stand', family: 'tech', term: 'подставка для телефона', re: /подставк[а-я]*\s*для\s*(?:телефон|планшет|смартфон)/i },
  { slug: 'phone_case', family: 'tech', term: 'чехол для телефона', re: /чехол\s*для\s*(?:телефон|смартфон|планшет)/i },
  { slug: 'towel', family: 'textile_bath', term: 'полотенце', re: /полотенц/i },
  { slug: 'blanket', family: 'textile_cozy', term: 'плед', re: /(?<![а-я])плед(?![а-я])/i },
  { slug: 'scarf', family: 'apparel', term: 'шарф', re: /(?<![а-я])шарф|платок\s*(?:шейн|на\s*шею)/i },
  { slug: 'gloves', family: 'apparel', term: 'перчатки', re: /перчатк|варежк/i },
  { slug: 'socks', family: 'apparel', term: 'носки', re: /(?<![а-я])носк|(?<![а-я])носоч/i },
  { slug: 'hoodie', family: 'apparel', term: 'худи', re: /(?<![а-я])худи(?![а-я])|толстовк|свитшот/i },
  { slug: 'tshirt', family: 'apparel', term: 'футболка', re: /футболк|(?<![а-я])поло(?![а-я])|лонгслив/i },
  { slug: 'cap', family: 'apparel', term: 'кепка', re: /(?<![а-я])кепк|бейсболк|(?<![а-я])шапк|панам|(?<![а-я])бини(?![а-я])/i },
  { slug: 'raincoat', family: 'apparel', term: 'дождевик', re: /дождевик|ветровк/i },
  { slug: 'backpack', family: 'bag', term: 'рюкзак', re: /рюкзак/i },
  { slug: 'cosmetic_bag', family: 'bag', term: 'косметичка', re: /косметичк|несессер/i },
  { slug: 'bag', family: 'bag', term: 'сумка', re: /(?<![а-я])сумк|шоппер|(?<![а-я])тоут(?![а-я])/i },
  { slug: 'notebook', family: 'writing', term: 'ежедневник', re: /ежедневник|блокнот|(?<![а-я])планер|скетчбук|еженедельник/i },
  { slug: 'pen', family: 'writing', term: 'ручка', re: /(?<![а-я])ручк|(?<![а-я])роллер|(?<![а-я])стилус/i },
  { slug: 'umbrella', family: 'umbrella', term: 'зонт', re: /(?<![а-я])зонт/i },
  { slug: 'candle', family: 'candle', term: 'свеча', re: /(?<![а-я])свеч|аромадиффуз|диффузор/i },
  { slug: 'keychain', family: 'keychain', term: 'брелок', re: /брелок/i },
  { slug: 'badge', family: 'badge', term: 'значок', re: /(?<![а-я])значок|(?<![а-я])бейдж/i },
  { slug: 'mirror', family: 'mirror', term: 'зеркало', re: /(?<![а-я])зеркал/i },
  { slug: 'sunglasses', family: 'sunglasses', term: 'очки', re: /(?<![а-я])очк|sunglass/i },
  { slug: 'cardholder', family: 'wallet', term: 'визитница', re: /визитниц|картхолдер|карт[\s-]?холдер|держател[а-я]*\s*для\s*(?:карт|визит)/i },
  { slug: 'wallet', family: 'wallet', term: 'кошелек', re: /кошел[её]к|портмоне/i },
  { slug: 'organizer', family: 'organizer', term: 'органайзер', re: /органайзер/i },
  { slug: 'plaid', family: 'textile_cozy', term: 'плед', re: /(?<![а-я])плейд/i },
];

/**
 * Тип ЕДИНСТВЕННОГО товара, о котором бриф, или null. Возвращает {slug, nameRe} только если в брифе
 * ровно ОДНО семейство товаров (термокружка=drinkware→один; «полотенце и плед»→два семейства→null).
 */
export function detectSingleProductType(
  brief: string,
): { slug: string; nameRe: RegExp; term: string } | null {
  const b = (brief || '').toLowerCase().replace(/ё/g, 'е');
  const hits = PRODUCT_KEYWORDS.filter((k) => k.re.test(b));
  if (!hits.length) return null;
  // РОВНО ОДИН тип товара по числу РАЗНЫХ слагов (не семей): «рюкзак и косметичка» — 2 слага
  // одной семьи `bag`, это набор из двух товаров, а не точечный запрос рюкзака (иначе искали бы
  // только рюкзаки, теряя косметичку). «термокружка» — 1 слаг (mug исключён lookbehind'ом термо).
  const slugs = new Set(hits.map((h) => h.slug));
  if (slugs.size !== 1) return null;
  return { slug: hits[0].slug, nameRe: hits[0].re, term: hits[0].term }; // самый специфичный (первый по порядку)
}

/** Сколько РАЗНЫХ семейств товаров явно названо в брифе («кружка и ежедневник» → 2). */
export function countNamedProductFamilies(brief: string): number {
  const b = (brief || '').toLowerCase().replace(/ё/g, 'е');
  return new Set(PRODUCT_KEYWORDS.filter((k) => k.re.test(b)).map((k) => k.family)).size;
}

// Богатые «сюжетные» темы, подразумевающие МНОГО разноплановых предметов (застолье → чашки,
// чайник, сладости, салфетки…). Каждая такая тема → крупный набор, а не дефолтные 3-4.
const RICH_SET_THEMES =
  /застол|праздничн[а-я]*\s*стол|накрыт[а-я]*\s*стол|(?<![а-я])стол\s+для\s+гост|чаепити|чайн[а-я]*\s*церемони|пикник|(?<![а-я])поход(?![а-я])|барбекю|(?<![а-я])мангал|рабоч[а-я]*\s*(?:мест|стол)|home\s*office|(?<![а-я])спа(?![а-я])|бариста|коктейл|дегустац|путешеств|кемпинг|новосель|дачн[а-я]*\s*набор|банн[а-я]*\s*набор|(?<![а-я])сауна|гурман|глинтвейн|уютн[а-я]*\s*вечер/i;

/**
 * ДИНАМИЧЕСКИЙ размер набора по СМЫСЛУ брифа (когда пользователь не задал число явно): точечный
 * товар → 1 позиция; «застолье»/сюжетная тема → крупный набор 5-7; перечислено N разных товаров → ~N.
 * null → нет смысловой оценки, размер решает бюджет/дефолт. Не заменяет явное число в брифе/полях.
 */
export function estimateSetSizeFromBrief(brief: string): { min: number; max: number } | null {
  const b = (brief || '').toLowerCase().replace(/ё/g, 'е');
  // Истинно точечный запрос (ровно один тип товара, без сигналов набора/аудитории) → 1 позиция.
  if (detectSingleProductType(brief) && !SET_SIGNALS.test(b)) return { min: 1, max: 1 };
  // Богатая сюжетная тема → крупный разноплановый набор.
  if (RICH_SET_THEMES.test(b)) return { min: 5, max: 7 };
  // Перечислено несколько конкретных товаров → набор примерно из стольких позиций.
  const named = countNamedProductFamilies(brief);
  if (named >= 2) return { min: named, max: Math.min(8, named + 1) };
  return null;
}

export interface DirectSearchArgs {
  catalog: CatalogProduct[];
  namedType: string;
  spec?: NamedPositionSpec;
  budgetPerSet?: number | null;
  brandColors?: string[];
  forbiddenItems?: string[];
  tirage?: number | null;
  limit: number;
  /** Матч типа по ИМЕНИ товара (для типов вне slug-таксономии: коврик для мыши/визитница/лампа/…). */
  nameMatch?: RegExp;
  /** id товаров под запретом (blacklist пользователя + товары прошлой генерации при регене) —
   *  исключаем из выборки, чтобы регенерация не отдавала те же SKU и чтобы уважать blacklist. */
  excludeIds?: Set<string>;
  /** Текст брифа — для жёсткого гейта forbidden-цвета/цвето-критичного клеша с брендом (G1:
   *  раньше direct-search вообще не проверял цвет как ограничение, только как мягкий ранкинг). */
  brief?: string;
  /** Материал из LLM-классификации намерения брифа («дерево», «керамика») — мягкий текстовый буст
   *  по имени/описанию товара, т.к. в БД нет структурированного поля материала. */
  materialHint?: string | null;
  /** Характеристика из LLM-классификации («5000 мАч») — доп. текстовый буст поверх числовых
   *  ProductAttribute (regex numeric extraction может не поймать нестандартную формулировку). */
  characteristicHint?: string | null;
}

/**
 * ПРЯМОЙ ПОИСК ПО КАТАЛОГУ под именованный тип + атрибуты («5000 мАч») + цвет («белый»).
 * Возвращает топ-`limit` РАЗНЫХ товаров (по variant/line-ключу), ранжированных по точности:
 * совпадение атрибутов (сильнее всего) → цвет → желанность → близость к бюджету.
 */
export function searchDirectCatalogProducts(args: DirectSearchArgs): CatalogProduct[] {
  const { catalog, namedType, spec, budgetPerSet, brandColors = [], forbiddenItems = [], tirage, limit, nameMatch, excludeIds, brief = '', materialHint, characteristicHint } = args;
  const materialNeedle = materialHint?.trim().toLowerCase();
  const characteristicNeedle = characteristicHint?.trim().toLowerCase();
  const textHasHint = (p: CatalogProduct, needle: string): boolean => {
    const haystack = `${p.name || ''} ${p.description || ''}`.toLowerCase();
    return haystack.includes(needle);
  };
  // Материал — стем-матч (падежные формы: «кожа» не матчится буквальным .includes на «кожи»/
  // «кожаный»), характеристика («5000 мАч») — обычный substring, там склонений нет.
  const materialMatches = (p: CatalogProduct): boolean =>
    !!materialHint && productMatchesMaterial(p, materialHint);
  const attrs = spec?.attributes ?? [];
  const wantColors = spec?.colors ?? [];
  const label = spec?.label ?? '';
  const forbiddenColorHints = parseBriefForbiddenColors(brief);
  // Товар нужного ТИПА: по slug-таксономии ИЛИ по имени (nameMatch — для типов вне таксономии).
  const typeOk = (p: CatalogProduct) =>
    detectConceptProductType(p) === namedType || (nameMatch != null && nameMatch.test(p.name || ''));

  const inBudget = (p: CatalogProduct) =>
    budgetPerSet == null || budgetPerSet <= 0 || (p.price ?? 0) <= budgetPerSet;
  const available = (p: CatalogProduct) =>
    !(excludeIds != null && excludeIds.has(p.id)) &&
    !productMatchesForbidden(p, forbiddenItems) &&
    !productHasForbiddenColor(p, forbiddenColorHints) &&
    !colorCriticalClash(p, brandColors) &&
    hasValidProductImage(p) &&
    (p.price ?? 0) > 0 &&
    (p.stockAvailable == null || p.stockAvailable > 0) &&
    (tirage == null || tirage <= 0 || (p.stockAvailable ?? 0) >= tirage);

  // Приоритет — точный тип; если мало, добираем матчем по имени именованной позиции.
  let pool = catalog.filter((p) => typeOk(p) && available(p) && inBudget(p));
  if (pool.length < limit && label) {
    const extra = catalog.filter(
      (p) =>
        !typeOk(p) &&
        available(p) &&
        inBudget(p) &&
        productMatchesNamedPosition(p, label, namedType),
    );
    pool = [...pool, ...extra];
  }
  // На пустом бюджетном срезе — тот же тип без бюджет-гейта (лучше показать чуть дороже, чем ничего).
  if (!pool.length) {
    pool = catalog.filter((p) => typeOk(p) && available(p));
  }

  const scored = pool
    .map((p) => {
      // ЯРУС по числу выполненных ТРЕБОВАНИЙ запроса (атрибут «5000 мАч» + цвет «белый»):
      // товар, удовлетворяющий ОБА, всегда выше удовлетворяющего одно, а тот — выше «ни одного».
      const attrRes = attrs.length ? matchProductAttributes(attrs, p) : null;
      const attrOk = !!attrRes && attrRes.matched.length > 0 && attrRes.mismatches.length === 0;
      const colorOk = wantColors.length ? productMatchesRequestedColorFamily(p, wantColors) : false;
      const materialOk = materialMatches(p);
      const characteristicOk = characteristicNeedle ? textHasHint(p, characteristicNeedle) : false;
      const reqMet =
        (attrs.length ? (attrOk ? 1 : 0) : 0) +
        (wantColors.length ? (colorOk ? 1 : 0) : 0) +
        (materialNeedle ? (materialOk ? 1 : 0) : 0) +
        (characteristicNeedle ? (characteristicOk ? 1 : 0) : 0);
      // Балансный скор ВНУТРИ яруса: атрибут и цвет весят одинаково — при отсутствии идеального
      // «белый 5000» результаты чередуют белые повербанки и 5000-мАч, а не топят цвет.
      let s = 0;
      if (attrRes) {
        s += attrRes.matched.length * 65;
        s -= attrRes.mismatches.length * 55;
      }
      if (wantColors.length) s += colorOk ? 65 : -55;
      if (brandColors.length && productMatchesRequestedColorFamily(p, brandColors)) s += 8;
      // Материал/характеристика из LLM-классификации — текстовый буст (в БД нет структурных полей,
      // поэтому только «нашли подстроку в имени/описании», без штрафа за отсутствие — товар мог
      // просто не упомянуть материал в названии, не значит, что он не подходит.
      if (materialNeedle && materialOk) s += 45;
      if (characteristicNeedle && characteristicOk) s += 45;
      s += Math.min(16, Math.max(-16, scoreDesirability(p)));
      if (budgetPerSet && budgetPerSet > 0) {
        const frac = (p.price ?? 0) / budgetPerSet;
        s += frac >= 0.3 ? 12 : frac * 40; // не самый копеечный вариант
      }
      return { p, reqMet, colorOk, s };
    })
    // Ярус (сколько требований выполнено) → цвет (пользователь ведёт с «белый», при равенстве
    // требований белый выше не-белого) → детальный скор.
    .sort(
      (a, b) => b.reqMet - a.reqMet || Number(b.colorOk) - Number(a.colorOk) || b.s - a.s,
    );

  const picked: CatalogProduct[] = [];
  const seen = new Set<string>();
  for (const { p } of scored) {
    if (picked.length >= limit) break;
    const vk = productVariantKey(p);
    const lk = productLineKeyFromName(p.name);
    if (seen.has(vk) || (lk && seen.has(lk))) continue;
    seen.add(vk);
    if (lk) seen.add(lk);
    picked.push(p);
  }
  return picked;
}
