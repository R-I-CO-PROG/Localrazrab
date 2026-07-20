import { createHash } from 'crypto';

/** Уникальный ключ концепции для имени файла (латиница или короткий hash) */
export function conceptFileKey(title?: string | null): string {
  const t = title?.trim() || 'default';
  const ascii = t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length >= 3) return ascii.slice(0, 40);
  const hash = createHash('sha1').update(t).digest('hex').slice(0, 10);
  return `c${hash}`;
}

/** Отдельный файл на каждую концепцию и revision — без перезаписи и кеша браузера */
export function buildGenerationOutputFilename(
  generationId: string,
  snapshot: { revision?: unknown; chosenIdeaTitle?: string | null },
): string {
  const revision = Math.max(1, Number(snapshot.revision) || 1);
  const key = conceptFileKey(snapshot.chosenIdeaTitle as string | null);
  return `${generationId}-${key}-r${revision}.png`;
}
