/** Минимум идей от Ideator (после фильтрации); Critic берёт только CRITIC_TOP_N */
export const IDEATOR_MIN_IDEAS = 12;

/** Целевое число идей в одном ответе LLM */
export const IDEATOR_TARGET_IDEAS = 18;

/** Мягкий минимум — не падаем, если почти набрали пул для Critic */
export const IDEATOR_SOFT_MIN_IDEAS = 8;

/** Верхняя граница после нормализации */
export const IDEATOR_MAX_IDEAS = 28;

/** Сколько концепций отдаём пользователю (переопределяется CATALOG_TARGET_CONCEPTS) */
export const CRITIC_TOP_N = 8;

/**
 * Быстрый pipeline: меньше идей от Ideator, без LLM Critic.
 * Нужно 5 концепций с распределением 1+3+1 по boldness — генерируем 14,
 * чтобы хватало пула на каждый уровень смелости (≥3 стандартных, ≥7
 * интересных, ≥2 смелых) после отсева похожих. Быстрая LLM (gemini-flash)
 * выдаёт 14 идей за единицы секунд.
 */
export const IDEATOR_TARGET_IDEAS_FAST = 10;
export const IDEATOR_MIN_IDEAS_FAST = 7;
export const IDEATOR_MAX_ATTEMPTS_FAST = 1;
