/**
 * JSON.parse с защитой от OOM.
 *
 * Голый `JSON.parse` на гигантском или мусорном теле (HTML-страница ошибки Cloudflare, обрыв
 * VPN-туннеля, рантайм-сбой модели, ответ на много сотен МБ) строит `SyntaxError` поверх всей
 * строки и роняет ВЕСЬ процесс: `FATAL ERROR: JavaScript heap out of memory` внутри
 * `JsonParser::ParseJson`. Падение одного запроса убивает API целиком — и все флоу у всех
 * пользователей виснут (очередь+опрос статуса не дожидается ответа).
 *
 * Здесь сначала режем по размеру: тело крупнее лимита → обычная перехватываемая ошибка вместо
 * аборта сервиса. На легитимные ответы (даже с base64-картинкой ~1–15 МБ) лимит не влияет.
 */
export const MAX_JSON_PARSE_BYTES = 128 * 1024 * 1024;

export function safeJsonParse<T = unknown>(
  text: string,
  label = 'response',
  maxBytes: number = MAX_JSON_PARSE_BYTES,
): T {
  if (text.length > maxBytes) {
    throw new Error(
      `${label}: тело ответа слишком большое для разбора (${text.length} байт > ${maxBytes})`,
    );
  }
  return JSON.parse(text) as T;
}
