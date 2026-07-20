import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import type { AgentDebugTraceFn } from './agent-debug.types';
import { withTimeout } from '../common/promise-timeout.util';
import { parseCatalogSelectorJson, parseCatalogComposeJson } from '../providers/llm/parse-llm-json';
import { parseAgentJson } from './json-repair.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import type {
  ConceptBoldness,
  NeuralSelectionInput,
  NeuralSelectionResult,
} from '../providers/llm/catalog-neural-selector.types';

export interface ComposeSetInput {
  brief: string;
  conceptTitle: string;
  conceptNarrative: string;
  boldness: ConceptBoldness;
  budgetPerSet: number | null;
  minItems: number;
  maxItems: number;
  pool: CatalogProduct[];
  brandColors: string[];
}

export interface ComposeSetResult {
  productIds: string[];
  coherenceNote?: string;
}

/** Вход LLM-критика связности: оценивает СОБРАННЫЙ набор целиком и предлагает 1-2 замены. */
export interface RerankSetInput {
  brief: string;
  conceptTitle: string;
  conceptNarrative: string;
  audienceNeeds?: string[];
  archetypeId?: string | null;
  budgetPerSet: number | null;
  current: CatalogProduct[];
  pool: CatalogProduct[];
}
export interface RerankReplace {
  outId: string;
  inId: string;
  reason: string;
}
export interface RerankResult {
  replace: RerankReplace[];
  coherenceNote?: string;
}

/** Разбор ответа критика: {"replace":[{outId,inId,reason}],"coherenceNote"}. Никогда не бросает.
 *  Раньше контракт был ЛОЖНЫМ: голый JSON.parse бросал на висячей запятой/обрыве. Теперь —
 *  закалённая лестница parseAgentJson (repair + single-quote + salvage обрыва), а при полном
 *  провале честно отдаём пустой результат (реранк — необязательное улучшение, набор остаётся). */
export function parseRerankJson(content: string): RerankResult {
  let obj: {
    replace?: Array<{ outId?: unknown; inId?: unknown; reason?: unknown }>;
    coherenceNote?: unknown;
  };
  try {
    obj = parseAgentJson(content);
  } catch {
    return { replace: [] };
  }
  const replace = Array.isArray(obj?.replace)
    ? obj.replace
        .filter((r) => r && typeof r.outId === 'string' && typeof r.inId === 'string' && r.outId !== r.inId)
        .slice(0, 2)
        .map((r) => ({ outId: String(r.outId), inId: String(r.inId), reason: typeof r.reason === 'string' ? r.reason.slice(0, 120) : '' }))
    : [];
  return { replace, coherenceNote: typeof obj?.coherenceNote === 'string' ? obj.coherenceNote.slice(0, 200) : undefined };
}

const BOLDNESS_GUIDANCE: Record<ConceptBoldness, string> = {
  0: 'СТАНДАРТНЫЙ набор: безопасный, проверенный мейнстрим. Бери очевидно уместные, '
    + 'универсальные предметы — то, что точно понравится большинству.',
  1: 'ИНТЕРЕСНЫЙ набор: небанальные, но уместные предметы. Добавь продуманные, '
    + 'не самые очевидные позиции, сохраняя практичность.',
  2: 'ДЕРЗКИЙ набор: смелые, неожиданные ходы. Бери выразительные, нестандартные '
    + 'предметы — но они всё ещё должны быть релевантны брифу и аудитории.',
};

const SYSTEM_PROMPT_RERANK = `Ты — придирчивый арт-директор корпоративных подарков. Тебе дают УЖЕ СОБРАННЫЙ набор (current)
и пул альтернатив (pool). Оцени набор КАК ЕДИНЫЙ ПОДАРОК для аудитории и повода из брифа: это связная
продуманная история или случайная свалка предметов?

Найди максимум 1-2 позиции, которые ХУЖЕ всего: (а) не про эту профессию/повод (врачу — сувенирная
флешка/обложка паспорта/антистресс/авоська; продажнику — кухонная утварь/12 карандашей/«цветочный»
дизайн/случайный гаджет), (б) ДЕШЁВКА, роняющая ценность подарка: предмет заметно дешевле уровня
набора (грубо < 10% бюджета) или несерьёзный сувенир (брелок, шнурок, чехол для диска), (в) ломают
единство истории набора (предмет «из другого сценария»). Для КАЖДОЙ подбери замену — id из pool
ТОГО ЖЕ или лучшего типа, ДОРОЖЕ или равную по цене (бюджет надо осваивать, не экономить), уместную аудитории.

ПРАВИЛА: позиции, где всё хорошо, НЕ трогай. Если набор уже связный и уместный — верни пустой replace.
Не заменяй ради замены. inId обязан быть из pool. Максимум 2 замены.

Верни СТРОГО JSON, без markdown:
{"replace":[{"outId":"<id из current>","inId":"<id из pool>","reason":"<кратко почему>"}],"coherenceNote":"<1 фраза о наборе>"}`;

const SYSTEM_PROMPT_CATALOG_BUYER = `Ты — лучший в индустрии байер корпоративных подарков. Собираешь набор «под ключ»
для КОНКРЕТНОЙ аудитории и повода из брифа. Тебе дают бриф, концепцию набора и по каждому слоту —
список реальных товаров каталога (кандидаты). Выбери РОВНО ОДИН товар на каждый слот.

ШАГ 1 — пойми получателя. Кто получит набор и по какому поводу? Что для НИХ уместно и приятно?
Например: менеджеру по продажам — рабочие инструменты, презентабельность, статус (НЕ кухонная
утварь/вино/сыр/выпечка); участнику IT-хакатона — гаджеты, зарядки, девайсы, стильная техника
(НЕ полотенца, винные аксессуары); женщинам на 8 марта — приятные, эстетичные, «для себя» вещи,
весеннее настроение (НЕ офисная канцелярия как основа, НЕ «награды»/«медали»/«юбки»/диеты);
премиум к юбилею — статусные, качественные, дорогие предметы (используй весь бюджет).

ШАГ 2 — выбери лучший товар на каждый слот по приоритетам:
1. РЕЛЕВАНТНОСТЬ: товар реально подходит ЭТОЙ аудитории и поводу. Беспощадно отвергай
   «не в тему» предметы, даже если они единственные в слоте — лучше верни productId: null.
   ЗАПРЕЩЕНО тащить случайный novelty не по брифу: винные/сырные/барные/кухонные/для выпечки
   наборы, «награды/медали/кубки», шуточные товары — ТОЛЬКО если бриф прямо про это (еда, вино,
   праздник дегустации и т.п.).
2. СВЯЗНОСТЬ («история»): набор читается как один продуманный подарок, а не свалка. Смотри на
   уже выбранные позиции — каждый следующий товар должен дополнять их, а не дублировать роль.
3. РАЗНООБРАЗИЕ внутри набора: НЕ бери два товара одной категории/роли (две сумки, два блокнота,
   две кружки) — это выглядит как остатки склада.
4. БЮДЖЕТ: сумма набора должна быть БЛИЗКА к верхней границе бюджета (осваивай бюджет, не
   экономь), но НЕ превышать её. В премиум-брифах не ставь дешёвку.
5. СМЕЛОСТЬ (boldness): следуй заданному уровню.
6. БЕЗ ПОВТОРОВ: не выбирай почти одинаковые предметы; разные наборы должны отличаться.

Выбирай productId ТОЛЬКО из кандидатов своего слота. Нет подходящего — productId: null.

Ответ — СТРОГО JSON, без markdown:
{"choices":[{"slotIndex":0,"productId":"<id|null>","reason":"<коротко>"}],"coherenceNote":"<1 фраза>"}`;

const SYSTEM_PROMPT_COMPOSE = `Ты — лучший в индустрии байер корпоративных подарков. Собираешь ОДИН набор
«под ключ» для конкретной аудитории и повода из брифа. Тебе дают бриф, концепцию набора (тема,
стиль, смелость) и ПУЛ реальных товаров каталога. Собери из пула связный набор.

ШАГ 1 — пойми получателя: кто получит и по какому поводу? Что для НИХ уместно и приятно?
Примеры-ориентиры (анти-паттерны строгие):
• менеджер по продажам / онбординг → рабочие, презентабельные, мотивирующие вещи (ежедневник,
  хорошая ручка, термокружка/бутылка, повербанк, рюкзак/сумка для документов). НЕ кухня/вино/сыр/
  выпечка/виски, НЕ фитнес-резинки, НЕ пластиковые бокалы, НЕ «приватность/конфиденциальность».
• IT-хакатон → гаджеты, зарядки, кабели, USB-хабы, повербанки, стильная техника, рюкзак, блокнот.
  НЕ полотенца, НЕ винные/барные аксессуары, НЕ детские/цветочные предметы, НЕ флешки <16ГБ.
• женщины на 8 марта → приятные, эстетичные вещи «для себя», весеннее настроение (кружка/чайная
  пара, аромат, блокнот красивый, аксессуар). НЕ офисная канцелярия как основа, НЕ награды/медали,
  НЕ мужская/детская одежда, НЕ «диеты».
• эко-конференция → переработанные/натуральные/многоразовые: эко-сумка, термос/бутылка, блокнот из
  растсырья, бамбук. НЕ бытовая техника (увлажнители/лампы/метеостанции), НЕ копеечный филлер,
  НЕ случайные гаджеты «ради бюджета».
• пикник/активный отдых КОМПАНИИ → плед, складная посуда/бутылки, сумка-холодильник, термос, игры
  на природе (мяч/фрисби/бадминтон), фонарь, мультитул — на ГРУППУ. НЕ винные пробки/штопоры/
  аэраторы, НЕ селфи-палки, НЕ одиночная одежда.
• премиум/юбилей/топ-менеджмент → один статусный «герой»-предмет (кожа/металл/бренд) + дорогие
  качественные вещи. НЕ пластиковые/настенные часы, НЕ метеостанции, НЕ дешёвые сумки <1000₽,
  НЕ два пишущих предмета, НЕ opaque-бандлы. Держи премиум-уровень даже у стандартного набора.

ШАГ 2 — собери набор из {min}-{max} товаров пула по приоритетам:
0. ПОЛНОТА: набор ОБЯЗАН содержать не меньше {min} позиций. При достаточном бюджете стремись к {max}
   тематичных позиций — это полноценный подарок, а не 2 предмета. Тонкий набор из 2 вещей при живом
   бюджете — провал, даже если каждая вещь идеальна.
1. РЕЛЕВАНТНОСТЬ аудитории и поводу — каждый товар на своём месте. НЕ бери случайный novelty не по
   брифу (винные/сырные/барные/кухонные наборы, награды, шуточные товары), если бриф не про это.
   ТЕСТ КАЖДОГО ПРЕДМЕТА: ответь одним предложением «зачем он ИМЕННО этой аудитории в этой истории?»
   Если ответ «просто полезная вещь» — НЕ бери (косметичка/семейный органайзер/головоломка
   продажнику, фляжка/игрушка врачу = провал). Личные и бытовые предметы — только если история про это.
2. СВЯЗНОСТЬ — СТРУКТУРА ИСТОРИИ: 1 ГЕРОЙ (главный предмет, задающий тему набора) + 2-3 ПОДДЕРЖКИ
   (из ТОЙ ЖЕ истории, дополняют героя) + максимум 1 акцент. ОБЯЗАТЕЛЬНО включи 1-2 позиции с явной
   профессиональной привязкой к аудитории (продажнику — визитница/папка для документов/презентационное;
   врачу — предмет заботы/восстановления после смены) — ЕСЛИ такие есть в пуле, они в его начале.
3. РАЗНООБРАЗИЕ ролей: НЕ бери два товара одной категории/роли (две сумки, два блокнота, две ручки).
4. ЦВЕТ: для вещей, которые БЫВАЮТ разных цветов (одежда, сумки, рюкзаки, зонты, пледы, кружки,
   термосы, бутылки, текстиль) — бери в ФИРМЕННЫХ цветах (brand_colors) по полю color кандидата.
   Если бренд-цвета нет — бери НЕЙТРАЛЬНЫЙ (чёрный/белый/серый/беж). НИКОГДА не бери явно чужой
   цвет (для красного бренда — НЕ фуксия/синий/зелёный). У электроники/гаджетов свой цвет — ок.
5. БЮДЖЕТ: стремись освоить 85–100% верхней границы КАЧЕСТВЕННЫМИ ТЕМАТИЧНЫМИ позициями, не превышая
   её. Порядок предпочтений: полный тематичный набор ≫ недобор бюджета ≫ добор нетематичным филлером.
6. СМЕЛОСТЬ (boldness): следуй уровню набора.

Бери productId ТОЛЬКО из пула. Верни СТРОГО JSON, без markdown:
{"productIds":["id1","id2",...],"coherenceNote":"<1 фраза>"}`;

interface BuyerCandidatePayload {
  id: string;
  name: string;
  price: number | null;
  category: string;
  color?: string;
  desc?: string;
}

function productColorLabel(p: CatalogProduct): string | undefined {
  const labels = (p.colors ?? [])
    .map((c) =>
      typeof c === 'string'
        ? c
        : c && typeof c === 'object'
          ? String((c as { name?: string; hex?: string }).name ?? (c as { hex?: string }).hex ?? '')
          : '',
    )
    .filter(Boolean);
  return labels.length ? labels.join('/') : undefined;
}

@Injectable()
export class CatalogBuyerAgent {
  private readonly logger = new Logger(CatalogBuyerAgent.name);

  constructor(
    private readonly openrouter: OpenrouterAgentClient,
    private readonly config: ConfigService,
  ) {}

  private timeoutMs(): number {
    return (
      Number(this.config.get('OPENROUTER_TIMEOUT_MS_CATALOG_SELECTOR')) || 45_000
    );
  }

  private buildUserMessage(input: NeuralSelectionInput): string {
    const slots = input.shortlists.map((sl, slotIndex) => ({
      slotIndex,
      type: sl.slot.type,
      priority: sl.slot.priority,
      notes: sl.slot.notes ?? sl.slot.positionLabel ?? undefined,
      candidates: sl.candidates.slice(0, 20).map(
        (p): BuyerCandidatePayload => ({
          id: p.id,
          name: p.name,
          price: p.price ?? null,
          category: p.category,
          desc: p.description?.slice(0, 120) || undefined,
        }),
      ),
    }));
    return JSON.stringify({
      brief: input.brief,
      concept: {
        title: input.conceptTitle,
        narrative: input.conceptNarrative,
        boldness: input.boldness,
        boldness_guidance: BOLDNESS_GUIDANCE[input.boldness],
      },
      budget_per_set: input.budgetPerSet,
      min_items: input.minItems,
      max_items: input.maxItems,
      brand_colors: input.brandColors,
      slots,
    });
  }

  private candidatePayload(p: CatalogProduct): BuyerCandidatePayload {
    return {
      id: p.id,
      name: p.name,
      price: p.price ?? null,
      category: p.category,
      color: productColorLabel(p),
      desc: p.description?.slice(0, 100) || undefined,
    };
  }

  /**
   * Композиция набора из единого пула (не по слотам). Возвращает упорядоченный список
   * productId или null (disabled/timeout/parse error). Никогда не бросает.
   */
  async composeSet(
    input: ComposeSetInput,
    trace?: AgentDebugTraceFn,
  ): Promise<ComposeSetResult | null> {
    if (!this.openrouter.isEnabled()) return null;
    if (!input.pool.length) return null;
    const t0 = Date.now();
    const userMessage = JSON.stringify({
      brief: input.brief,
      concept: {
        title: input.conceptTitle,
        narrative: input.conceptNarrative,
        boldness: input.boldness,
        boldness_guidance: BOLDNESS_GUIDANCE[input.boldness],
      },
      budget_per_set: input.budgetPerSet,
      min_items: input.minItems,
      max_items: input.maxItems,
      brand_colors: input.brandColors,
      pool: input.pool.slice(0, 60).map((p) => this.candidatePayload(p)),
    });
    // Подставляем реальные {min}/{max}: раньше плейсхолдеры уходили в промпт БУКВАЛЬНО («не меньше
    // {min} позиций»), инструкция полноты читалась как литерал. Числа есть и в JSON userMessage, но
    // в системном промпте они задают приоритет — подстановка делает правило полноты действенным.
    const systemPrompt = SYSTEM_PROMPT_COMPOSE.replace(/\{min\}/g, String(input.minItems)).replace(
      /\{max\}/g,
      String(input.maxItems),
    );
    try {
      const raw = await withTimeout(
        this.openrouter.chatJson({
          systemPrompt,
          userMessage,
          modelEnvKey: 'OPENROUTER_MODEL_CATALOG_SELECTOR',
          maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_CATALOG_SELECTOR',
          defaultMaxTokens: 2500,
          agentName: 'CatalogBuyerAgent(compose)',
          trace,
        }),
        this.timeoutMs(),
        'CatalogCompose',
      );
      const result = parseCatalogComposeJson(raw);
      this.logger.log(
        `CatalogCompose "${input.conceptTitle}": ${result.productIds.length} items in ${Date.now() - t0}ms`,
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `CatalogCompose "${input.conceptTitle}" failed in ${Date.now() - t0}ms (${msg}) — deterministic fallback`,
      );
      return null;
    }
  }

  /**
   * LLM-критик связности: оценивает СОБРАННЫЙ набор целиком и предлагает 1-2 замены на лучшие из
   * пула. Единственное место, где ИИ судит итог как единое целое (composeSet выбирает поштучно).
   * Возвращает список замен или null (disabled/timeout/parse error) — вызывающий детерминированно
   * валидирует их (applyRerankToSet). Никогда не бросает.
   */
  async rerankSet(input: RerankSetInput, trace?: AgentDebugTraceFn): Promise<RerankResult | null> {
    if (!this.openrouter.isEnabled()) return null;
    if (input.current.length < 2 || !input.pool.length) return null;
    const t0 = Date.now();
    const userMessage = JSON.stringify({
      brief: input.brief,
      concept: { title: input.conceptTitle, narrative: input.conceptNarrative },
      audience_needs: input.audienceNeeds ?? [],
      archetype: input.archetypeId ?? null,
      budget_per_set: input.budgetPerSet,
      current: input.current.map((p) => this.candidatePayload(p)),
      pool: input.pool.slice(0, 30).map((p) => this.candidatePayload(p)),
    });
    try {
      const raw = await withTimeout(
        this.openrouter.chatJson({
          systemPrompt: SYSTEM_PROMPT_RERANK,
          userMessage,
          modelEnvKey: 'OPENROUTER_MODEL_CATALOG_SELECTOR',
          maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_CATALOG_RERANK',
          defaultMaxTokens: 600,
          agentName: 'CatalogBuyerAgent(rerank)',
          trace,
        }),
        this.timeoutMs(),
        'CatalogRerank',
      );
      const result = parseRerankJson(raw);
      this.logger.log(`CatalogRerank "${input.conceptTitle}": ${result.replace.length} swap(s) in ${Date.now() - t0}ms`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`CatalogRerank "${input.conceptTitle}" failed in ${Date.now() - t0}ms (${msg}) — keep set`);
      return null;
    }
  }

  /**
   * Один батч-вызов LLM на концепцию. Возвращает выбор по слотам или null
   * (disabled / timeout / parse error) — вызывающий доберёт детерминированно.
   * Никогда не бросает исключений.
   */
  async selectForConcept(
    input: NeuralSelectionInput,
    trace?: AgentDebugTraceFn,
  ): Promise<NeuralSelectionResult | null> {
    if (!this.openrouter.isEnabled()) return null;
    if (!input.shortlists.length) return null;
    const t0 = Date.now();
    try {
      const raw = await withTimeout(
        this.openrouter.chatJson({
          systemPrompt: SYSTEM_PROMPT_CATALOG_BUYER,
          userMessage: this.buildUserMessage(input),
          modelEnvKey: 'OPENROUTER_MODEL_CATALOG_SELECTOR',
          maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_CATALOG_SELECTOR',
          defaultMaxTokens: 2500,
          agentName: 'CatalogBuyerAgent',
          trace,
        }),
        this.timeoutMs(),
        'CatalogBuyer',
      );
      const result = parseCatalogSelectorJson(raw);
      this.logger.log(
        `CatalogBuyer "${input.conceptTitle}": ${result.choices.length} choices in ${Date.now() - t0}ms`,
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `CatalogBuyer "${input.conceptTitle}" failed in ${Date.now() - t0}ms (${msg}) — deterministic fallback`,
      );
      return null;
    }
  }
}
