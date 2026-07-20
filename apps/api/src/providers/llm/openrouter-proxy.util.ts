/**
 * ЕДИНЫЙ канал выхода на OpenRouter.
 *
 * OpenRouter за Cloudflare режет IP хостера: прямой запрос отдаёт `HTTP 403 {"error":"Access denied
 * by security policy."}`. Egress через VPN-прокси (sing-box на 127.0.0.1) — чистый. Поэтому ВСЕ
 * запросы к OpenRouter обязаны идти через `OPENROUTER_PROXY`.
 *
 * Модуль существует потому, что раньше диспетчер копировался в каждый клиент по отдельности —
 * чат и эмбеддинги его завели, а клиент генерации картинок забыл, и визуализация молча падала с 403
 * при живом и здоровом прокси. Новый клиент OpenRouter обязан звать `openRouterFetch`, а не `fetch`.
 *
 * ЛЕНИВО и мемоизировано: `OPENROUTER_PROXY` подхватывается dotenv/ConfigModule ПОЗЖЕ, чем
 * выполняется module-load, поэтому env читаем при первом запросе, а не на верхнем уровне.
 * `undici` — транзитивная зависимость (есть в рантайме): guarded-require, без неё работаем напрямую.
 */

let _dispatcher: unknown;
let _resolved = false;

/** Диспетчер undici для прокси. `undefined` — прокси не задан или undici недоступен. */
export function openRouterProxyDispatcher(): unknown {
  if (_resolved) return _dispatcher;
  _resolved = true;
  const url = process.env.OPENROUTER_PROXY?.trim();
  if (url) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ProxyAgent } = require('undici');
      _dispatcher = new ProxyAgent(url);
    } catch {
      /* undici недоступен — работаем без прокси (прямой fetch) */
    }
  }
  return _dispatcher;
}

/** Только для тестов: сбросить мемоизацию после подмены env. */
export function resetOpenRouterProxyForTests(): void {
  _dispatcher = undefined;
  _resolved = false;
}

/** Задан ли прокси в окружении (диагностика на старте). */
export function isOpenRouterProxyConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_PROXY?.trim());
}

/**
 * `fetch` к OpenRouter через прокси. Использовать вместо голого `fetch` во ВСЕХ клиентах
 * OpenRouter — иначе запрос уйдёт с IP хостера и получит 403.
 */
export function openRouterFetch(url: string, init: RequestInit): Promise<Response> {
  const dispatcher = openRouterProxyDispatcher();
  return fetch(url, {
    ...init,
    ...(dispatcher ? { dispatcher } : {}),
  } as RequestInit & { dispatcher?: unknown });
}
