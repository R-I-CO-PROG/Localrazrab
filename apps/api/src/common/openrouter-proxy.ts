// Единый VPN-прокси диспетчер для всех OpenRouter-клиентов.
// Используется в: openrouter-agent.client, openrouter-llm.provider, openrouter-image.client
//
// Почему lazy (не на верхнем уровне модуля):
//   dotenv/ConfigModule загружается позже module-load — читаем env при первом реальном запросе.
// Почему без флага _resolved:
//   Старый паттерн с _resolved=true при пустом URL навсегда блокировал прокси, если env
//   был ещё не загружен при первом вызове. Теперь мемоизируем только успешно созданный диспетчер.

let _dispatcher: unknown;

export function getOpenRouterProxyDispatcher(): unknown {
  if (_dispatcher) return _dispatcher;
  const url = process.env.OPENROUTER_PROXY?.trim();
  if (!url) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ProxyAgent } = require('undici');
    _dispatcher = new ProxyAgent(url);
  } catch {
    /* undici недоступен в рантайме — работаем без прокси */
  }
  return _dispatcher;
}

/** Spread-friendly: возвращает { dispatcher } или {} */
export function openRouterFetchExtra(): { dispatcher?: unknown } {
  const d = getOpenRouterProxyDispatcher();
  return d ? { dispatcher: d } : {};
}
