import type { CatalogProduct } from './catalog.util';
import type { ProductSlot } from './catalog-slot-picker.util';
import type { GiftArchetype } from './catalog-context-scoring.util';

/** Boldness уровня концепции: 0 — стандарт, 1 — интересно, 2 — дерзко. */
export type ConceptBoldness = 0 | 1 | 2;

/** Шортлист реальных SKU-кандидатов под один слот концепции. */
export interface SlotShortlist {
  slot: ProductSlot;
  candidates: CatalogProduct[];
}

/** Выбор нейро-байера по одному слоту. */
export interface NeuralSlotChoice {
  slotIndex: number;
  productId: string | null;
  reason?: string;
}

/** Результат нейро-выбора по всей концепции. */
export interface NeuralSelectionResult {
  choices: NeuralSlotChoice[];
  coherenceNote?: string;
}

/** Вход нейро-байера (один батч-вызов на концепцию). */
export interface NeuralSelectionInput {
  brief: string;
  conceptTitle: string;
  conceptNarrative: string;
  boldness: ConceptBoldness;
  budgetPerSet: number | null;
  minItems: number;
  maxItems: number;
  shortlists: SlotShortlist[];
  brandColors: string[];
}

/** Контекст ретривала (сужения каталога до шортлистов). */
export interface ShortlistContext {
  brief: string;
  brandColors: string[];
  budgetPerSet: number | null;
  /** Сколько кандидатов оставлять на слот (по умолчанию 20). */
  perSlotSize?: number;
  /** Категории/типы, которые нельзя предлагать (UI «что нельзя»). */
  excludedItems?: string[];
  /** Сколько ПРЕДЫДУЩИХ наборов уже содержали данное семейство (для мягкого
   *  межконцептового анти-однообразия: плед/сумка/зонт не во всех 5 наборах). */
  familyUsage?: Map<string, number>;
  /** Типы (slug), названные пользователем в брифе как обязательные («повербанк», «зонт»…).
   *  Ретривал гарантирует их присутствие в пуле, сборка — в наборе. */
  mandatoryTypes?: string[];
  /** Тираж заявки: у mandatory-кандидатов приоритет получают SKU с остатком ≥ тиража. */
  tirage?: number | null;
  /** Ожидаемое число позиций в наборе — задаёт цель ценовой кривой (target=1/expectedItems).
   *  Без него target фиксирован на 5 и неполный набор тянется к дешёвке (недобор бюджета). */
  expectedItems?: number;
  /** Тема КОНКРЕТНОЙ концепции (название + состав-задумка) — тематический бонус в scoreRow,
   *  чтобы «Эко»/«Премиум»/«Технологичный» получали РАЗНЫЙ пул, а не общий топ брифа. */
  conceptTitle?: string;
  conceptComposition?: string;
  /** Потребности аудитории (из брифа): продажнику — презентации/мобильность, врачу — отдых. */
  audienceNeeds?: string[];
  /** Архетип подарка ЭТОЙ концепции (врач-«забота»…): задаёт связную историю + анти-сувенир. */
  archetype?: GiftArchetype | null;
}
