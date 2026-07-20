/**
 * СЕМАНТИЧЕСКИЙ СЛОЙ. Эмбеддинги (OpenRouter text-embedding-3-small, 1536-dim) дают сравнение
 * СМЫСЛА, а не слов: «органайзер для документов» и «органайзер для багажника» keyword-правила
 * не различают, а эмбеддинги — да. Товарные векторы лежат в Product.embedding (pgvector);
 * запросные векторы (бриф/сценарий/интент аудитории) считаем на лету с in-memory кэшем.
 */

import { safeJsonParse } from './safe-json-parse.util';

const EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL || 'text-embedding-3-small';
const EMBED_URL = 'https://openrouter.ai/api/v1/embeddings';
// Тот же VPN-прокси, что и для чата (обход Cloudflare-блока IP хостера), если задан OPENROUTER_PROXY.
// undici — транзитивная зависимость (есть на сервере в рантайме): guarded-require, ЛЕНИВО —
// OPENROUTER_PROXY грузится dotenv позже module-load, читаем env при первом обращении.
let _embedDispatcher: unknown;
let _embedDispatcherResolved = false;
function embedDispatcher(): unknown {
  if (_embedDispatcherResolved) return _embedDispatcher;
  _embedDispatcherResolved = true;
  const url = process.env.OPENROUTER_PROXY?.trim();
  if (url) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ProxyAgent } = require('undici');
      _embedDispatcher = new ProxyAgent(url);
    } catch {
      /* undici недоступен — прямой fetch */
    }
  }
  return _embedDispatcher;
}
const queryCache = new Map<string, number[]>();
const QUERY_CACHE_MAX = 512;

function apiKey(): string {
  return process.env.OPENROUTER_API_KEY?.trim() ?? '';
}

export function embeddingsEnabled(): boolean {
  return !!apiKey();
}

/** Эмбеддинг одного/нескольких запросных текстов (с кэшем по тексту). Пустой при недоступности. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!apiKey() || !texts.length) return [];
  const need: { i: number; text: string }[] = [];
  const out: number[][] = new Array(texts.length);
  texts.forEach((t, i) => {
    const key = t.slice(0, 400);
    const c = queryCache.get(key);
    if (c) out[i] = c;
    else need.push({ i, text: key });
  });
  if (need.length) {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: need.map((n) => n.text) }),
      signal: AbortSignal.timeout(20000),
      ...((): { dispatcher?: unknown } => {
        const d = embedDispatcher();
        return d ? { dispatcher: d } : {};
      })(),
    } as RequestInit & { dispatcher?: unknown });
    if (!res.ok) throw new Error(`embeddings ${res.status}`);
    const data = safeJsonParse<{ data?: Array<{ index: number; embedding: number[] }> }>(
      await res.text(),
      'embeddings',
    );
    if (!data.data) throw new Error('embeddings: no data');
    const sorted = data.data.slice().sort((a, b) => a.index - b.index);
    need.forEach((n, k) => {
      const vec = sorted[k]?.embedding ?? [];
      out[n.i] = vec;
      if (queryCache.size >= QUERY_CACHE_MAX) queryCache.delete(queryCache.keys().next().value as string);
      queryCache.set(n.text, vec);
    });
  }
  return out;
}

/** Один запросный эмбеддинг. */
export async function embedText(text: string): Promise<number[] | null> {
  const [v] = await embedTexts([text]);
  return v ?? null;
}

export function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

/**
 * ИНТЕНТ ПОДАРКА по аудитории: позитивная и негативная формулировки «что это за подарок».
 * Семантический фильтр = cos(товар, интент+) − cos(товар, интент−). Одна фраза на аудиторию —
 * обобщаемо (новая аудитория = одна строка), тренды покрываются смыслом, а не перечислением брендов.
 */
export interface GiftIntent {
  positive: string;
  negative: string;
}

/** Таблица аудиторий/поводов → интент (positive/negative). Одна строка = одна аудитория (обобщаемо). */
const INTENT_TABLE: Array<{ key: RegExp; positive: string; negative: string }> = [
  { key: /врач|медиц|клиник|(?<![а-яё])доктор|стоматолог|медработник|медсестр|фармац/i,
    positive: 'продуманный подарок врачу на профессиональный праздник: забота, восстановление после смены, уют, качественная практичная вещь — плед, термокружка, чай, бальзам, ежедневник',
    negative: 'случайный несерьёзный или бытовой предмет, не связанный с врачом: фляжка, спортивная игрушка, детская вещь, кухонная утварь, органайзер для машины, зонт' },
  { key: /менеджер[а-яё]*\s*по\s*продаж|продажник|онбординг|нов[а-яё]*\s*сотрудник|(?<![а-яё])sales/i,
    positive: 'деловой подарок менеджеру по продажам для встреч и переговоров: визитница, папка для документов, ежедневник, хорошая ручка, термокружка, повербанк, сумка для ноутбука',
    negative: 'случайная бытовая или личная вещь, не для работы менеджера: органайзер для багажника автомобиля, косметичка, игрушка, кухонный набор, сумка для обуви, дождевик' },
  { key: /разработчик|программист|инженер|(?<![а-яёa-z])it(?![а-яёa-z])|айти|devops|хакатон/i,
    positive: 'подарок IT-специалисту: техника и гаджеты, повербанк, беспроводные наушники, USB-хаб, термокружка, стильный рюкзак, блокнот',
    negative: 'непрофильная бытовая вещь: кухонная утварь, спортивный инвентарь, детская игрушка, декор' },
  { key: /8\s*март|женщин|девуш|(?<![а-яё])дам(?![а-яё])/i,
    positive: 'приятный эстетичный подарок женщине на 8 марта: аромат, красивая кружка или чайная пара, уходовая косметика, украшение, стильный аксессуар',
    negative: 'мужская или офисно-канцелярская вещь без эстетики, инструмент, спортивный инвентарь' },
  { key: /эко|устойчив|переработ|sustainab/i,
    positive: 'эко-подарок из переработанных/натуральных материалов: эко-сумка, бамбуковый предмет, многоразовая бутылка, блокнот из крафта',
    negative: 'электроника, пластиковый ширпотреб, случайный гаджет' },
  { key: /учител|педагог|преподавател|воспитател|наставник|день\s*знан/i,
    positive: 'подарок учителю с уважением: качественный ежедневник, стильная ручка, чайный набор, термокружка, аккуратный настольный аксессуар',
    negative: 'дешёвый сувенир, спортивный инвентарь, гаджет-игрушка, детская вещь' },
  { key: /руководител|директор|топ[\s-]?менедж|c-level|инвестор|партнёр|партнер|(?<![а-яё])vip|premium|премиум|люкс|luxury|юбилей/i,
    positive: 'премиальный статусный подарок руководителю/партнёру: кожа, металл, гравировка, футляр, дорогой ежедневник, качественная ручка, термокружка премиум',
    negative: 'дешёвый пластиковый сувенир, промо-мелочь, детская или спортивная вещь' },
  { key: /студент|молодёж|молодеж|фестивал|хакатон|вуз/i,
    positive: 'молодёжный подарок: стильный рюкзак, повербанк, беспроводные наушники, термокружка, яркий блокнот',
    negative: 'формальная офисная канцелярия, дорогой статусный предмет, бытовая утварь' },
  { key: /дизайнер|креатив|творч|арт[\s-]/i,
    positive: 'подарок креативной команде: скетчбук, качественные маркеры, стильный блокнот, необычный аксессуар, термокружка с дизайном',
    negative: 'скучная офисная канцелярия, спортивный инвентарь, бытовая утварь' },
];

/**
 * Интент подарка под аудиторию/повод. Для известных — точная формулировка; для ЛЮБОГО другого
 * брифа — generic fallback из самого текста (positive = «уместный подарок под <бриф>», negative =
 * «случайный неуместный не по поводу»), чтобы семантическая профильная детекция работала ВЕЗДЕ.
 */
export function giftIntentForBrief(brief: string): GiftIntent | null {
  const b = brief.toLowerCase();
  for (const row of INTENT_TABLE) if (row.key.test(b)) return { positive: row.positive, negative: row.negative };
  const clean = brief.trim().slice(0, 200);
  if (clean.length < 8) return null;
  // GENERIC: якорь — сам бриф. Учитывает повод/сезон буквально (НГ → без летних/пляжных вещей).
  const winter = /новогодн|нов[а-яё]*\s*год|зимн|рождеств/i.test(b);
  return {
    positive: `продуманный, уместный и качественный корпоративный подарок точно под задачу: «${clean}». Вещи, которые получатель оценит и будет пользоваться, связанные между собой в одну историю`,
    negative: `случайный, неуместный, дешёвый или несерьёзный предмет не по теме «${clean}», не подходящий получателю и поводу${winter ? ', летние и пляжные вещи' : ''}`,
  };
}
