/**
 * Детерминированный ретривал: при заданном seed один и тот же бриф даёт один и тот же пул.
 * По умолчанию (seed не задан) ретривал остаётся случайным — это осознанное разнообразие
 * (разные менеджеры видят разные товары). Seed включает воспроизводимость: сравнить прогоны,
 * стабильно дебажить, дать пользователю «показать те же варианты».
 */

/** mulberry32 — быстрый детерминированный PRNG в [0,1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9; // избегаем вырожденного нуля
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Число из строки (бриф) → стабильный seed (FNV-1a). */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Детерминированная перестановка (Fisher–Yates на seeded RNG). Не мутирует вход. */
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Детерминированный offset выборки бакета вместо Math.random. */
export function seededOffset(count: number, quota: number, rng: () => number): number {
  if (count <= quota) return 0;
  return Math.floor(rng() * (count - quota));
}
