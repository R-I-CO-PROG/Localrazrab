import { hasSetSignals } from './catalog-direct-search.util';
import { safeJsonParse } from './safe-json-parse.util';
import { extractJsonObject } from '../../agents/json-repair.util';

/**
 * LLM-КЛАССИФИКАТОР НАМЕРЕНИЯ БРИФА. Раньше здесь был узкий пробник «один товар или нет» —
 * теперь единая точка, которая решает ДВЕ вещи разом:
 *  1) mode: exact_position (один конкретный товар — «белый повербанк на 5000 мАч») vs
 *     idea (набор/подборка — «подарок команде на 8 марта»)
 *  2) для exact_position — на основании ЧЕГО подбирать (материал/цвет/характеристика, любых 0+);
 *     для idea — тип идеи: occasion (повод/аудитория) и/или purpose (назначение/категория)
 * Термин из exact_position уходит в существующий прямой поиск по каталогу (searchCatalogByText +
 * nameMatch), occasion/purpose — в контекст Ideator (см. AgentBriefContext.occasion) и в мягкие
 * allowedItems-бакеты. Локальный словарь PRODUCT_KEYWORDS остаётся отдельным быстрым сигналом —
 * этот классификатор его не заменяет физически, но его решение (mode/term) приоритетнее словаря.
 */

export interface BriefIntentProbe {
  mode: 'exact_position' | 'idea';
  /** Товар в именительном падеже, единственном числе (только для exact_position). */
  term: string | null;
  /** Материал — общее поле для ОБОИХ режимов: «белый повербанк» (материал товара) И «набор
   *  полностью кожаный» (материал ВСЕХ товаров в наборе — жёсткое требование, не пожелание). */
  material: string | null;
  color: string | null;
  /** Техническая характеристика свободным текстом («5000 мАч», «300 мл»), только для exact_position. */
  characteristic: string | null;
  /** Повод/аудитория/тип мероприятия (VIP, Новый год, Профессиональный праздник, Гендерные,
   *  Сотрудникам на мероприятие, Раздаточные материалы для ивентов — или другой повод из текста). */
  occasion: string | null;
  /** Назначение/категория товаров свободным текстом (спортивные товары, для рисования, …). */
  purpose: string | null;
}

const EMPTY_PROBE: BriefIntentProbe = {
  mode: 'idea',
  term: null,
  material: null,
  color: null,
  characteristic: null,
  occasion: null,
  purpose: null,
};

/**
 * Стоит ли звать LLM. Раньше пропускали, если локальный словарь уже нашёл тип — но теперь
 * классификатор нужен ВСЕГДА (даже для наборов — определить occasion/purpose), кроме пустых
 * или совсем коротких брифов, где классифицировать нечего.
 */
export function shouldProbeSingleProductViaLLM(brief: string): boolean {
  const b = (brief || '').trim();
  return b.length >= 3;
}

export const SINGLE_PRODUCT_PROBE_SYSTEM_PROMPT = `Ты классифицируешь бриф на корпоративный подарок. Разбери его в два шага.

ШАГ 1 — mode: пользователь просит ОДИН конкретный вид товара ("exact_position", например: вентилятор,
увлажнитель, повербанк, кружка) или подборку/набор/идею для повода или аудитории ("idea")?

ШАГ 2, если exact_position — определи (только если явно есть в тексте, иначе null):
- material: материал товара («дерево», «металл», «керамика»)
- color: цвет товара
- characteristic: техническая характеристика («5000 мАч», «300 мл», «32 ГБ»)
Это НЕ взаимоисключающие — может быть 0, 1 или все три сразу.

ШАГ 2, если idea — определи (только если явно понятно из текста, иначе null):
- material: материал, если клиент требует его для ВСЕХ товаров в наборе («полностью кожаный
  набор», «набор из дерева», «всё из эко-материалов») — это ЖЁСТКОЕ требование к каждой позиции,
  не пожелание. Если материал не назван для всего набора — null.
- occasion: повод/тип мероприятия. Примеры (список не строгий — если в брифе явно назван
  другой повод, пиши его своими словами): VIP, Новый год, Профессиональный праздник, Гендерные,
  Сотрудникам на мероприятие, Раздаточные материалы для ивентов.
- purpose: назначение/функция товаров свободным текстом («спортивные товары», «для рисования»,
  «для активного отдыха») — это ЧТО ДЕЛАЮТ товары, а НЕ отрасль/сфера деятельности заказчика.
  «для строительной компании», «для IT-отдела», «для банка» — это описание АУДИТОРИИ/ЗАКАЗЧИКА,
  НЕ purpose (сами товары не обязаны быть строительными/айтишными) — оставляй purpose null,
  если в тексте нет отдельного указания на ФУНКЦИЮ товаров.

Верни СТРОГО JSON без пояснений:
{"mode":"exact_position"|"idea","term":"..."|null,"material":"..."|null,"color":"..."|null,"characteristic":"..."|null,"occasion":"..."|null,"purpose":"..."|null}

Примеры:
"нужен вентилятор на стол" -> {"mode":"exact_position","term":"вентилятор","material":null,"color":null,"characteristic":null,"occasion":null,"purpose":null}
"белый повербанк на 5000 мАч" -> {"mode":"exact_position","term":"повербанк","material":null,"color":"белый","characteristic":"5000 мАч","occasion":null,"purpose":null}
"деревянная ручка" -> {"mode":"exact_position","term":"ручка","material":"дерево","color":null,"characteristic":null,"occasion":null,"purpose":null}
"подарок коллеге на день рождения" -> {"mode":"idea","term":null,"material":null,"color":null,"characteristic":null,"occasion":"День рождения","purpose":null}
"набор для чаепития" -> {"mode":"idea","term":null,"material":null,"color":null,"characteristic":null,"occasion":null,"purpose":"чаепитие"}
"новогодние подарки для сотрудников" -> {"mode":"idea","term":null,"material":null,"color":null,"characteristic":null,"occasion":"Новый год","purpose":null}
"спортивные подарки для мероприятия партнёрам" -> {"mode":"idea","term":null,"material":null,"color":null,"characteristic":null,"occasion":"Сотрудникам на мероприятие","purpose":"спортивные товары"}
"кружка и ежедневник" -> {"mode":"idea","term":null,"material":null,"color":null,"characteristic":null,"occasion":null,"purpose":null}
"набор полностью кожаный для строительной компании на 400 человек бюджет 5000" -> {"mode":"idea","term":null,"material":"кожа","color":null,"characteristic":null,"occasion":null,"purpose":null}`;

/** Разбор ответа LLM. Битый/пустой/неожиданный JSON → безопасный фолбэк {mode:"idea", всё null}. */
export function parseSingleProductLlmResponse(raw: string): BriefIntentProbe {
  if (!raw || !raw.trim()) return { ...EMPTY_PROBE };
  let data: unknown;
  try {
    // extractJsonObject срезает markdown-обёртку (```json ... ``` — некоторые модели её всё равно
    // добавляют, даже с response_format:json_object), иначе JSON.parse падает на первом же символе.
    data = safeJsonParse(extractJsonObject(raw), 'brief-intent probe');
  } catch {
    return { ...EMPTY_PROBE };
  }
  if (typeof data !== 'object' || data === null) return { ...EMPTY_PROBE };
  const obj = data as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const mode: BriefIntentProbe['mode'] = obj.mode === 'exact_position' ? 'exact_position' : 'idea';
  const term = str(obj.term);
  return {
    mode: mode === 'exact_position' && term ? 'exact_position' : 'idea',
    term: mode === 'exact_position' ? term : null,
    // material — общее поле для обоих режимов (см. интерфейс выше): для exact_position это
    // материал ОДНОГО товара, для idea — жёсткое требование материала для ВСЕГО набора.
    material: str(obj.material),
    color: mode === 'exact_position' ? str(obj.color) : null,
    characteristic: mode === 'exact_position' ? str(obj.characteristic) : null,
    occasion: mode === 'idea' ? str(obj.occasion) : null,
    purpose: mode === 'idea' ? str(obj.purpose) : null,
  };
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

/**
 * Стем товара для матча словоформ в имени SKU: срезаем короткое падежное окончание, если основа
 * остаётся ≥4 символов («кружка»→«кружк» ловит кружка/кружки; «вентилятор» без окончания → как есть,
 * префикс ловит вентиляторы/вентилятора). Латиница/короткие слова не трогаем.
 */
function productStem(word: string): string {
  const infl = /(ами|ями|ов|ев|ей|ам|ям|ах|ях|ой|ю|я|ы|и|у|е|а|ь|й|о)$/;
  const m = word.match(infl);
  if (m && word.length - m[0].length >= 4) return word.slice(0, -m[0].length);
  return word;
}

/**
 * Regex по ГЛАВНОМУ слову термина для матча типа по имени товара (nameMatch в прямом поиске).
 * Берём самое длинное слово (главное существительное), стемим, ставим lookbehind как в словаре.
 */
export function buildTermRegex(term: string): RegExp | null {
  const norm = (term || '').toLowerCase().replace(/ё/g, 'е').trim();
  const words = norm.split(/[^a-zа-я0-9]+/i).filter((w) => w.length >= 3);
  if (!words.length) return null;
  const main = words.sort((a, b) => b.length - a.length)[0]!;
  const stem = productStem(main).replace(ESCAPE_RE, '\\$&');
  if (stem.length < 3) return null;
  return new RegExp(`(?<![a-zа-я])${stem}`, 'i');
}
