import { createHash } from 'crypto';
import { conceptFileKey } from './generation-output-path.util';

export type ConceptResultVariant = {
  id: string;
  imageUrl: string;
  revision: number;
  finishedAt: string;
  refinementBrief?: string | null;
};

export type ConceptGenerationResult = {
  chosenIdeaTitle: string;
  resultImageUrl: string;
  productIds: string[];
  revision: number;
  finishedAt: string;
  variants: ConceptResultVariant[];
};

export type ConceptResultsMap = Record<string, ConceptGenerationResult>;

/** Стабильный ключ концепции в JSON map (совпадает с суффиксом имени файла) */
export function conceptResultKey(title?: string | null): string {
  return conceptFileKey(title);
}

export function parseConceptResults(raw: unknown): ConceptResultsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ConceptResultsMap;
}

function normalizeVariants(entry: ConceptGenerationResult): ConceptResultVariant[] {
  if (entry.variants?.length) return entry.variants;
  if (!entry.resultImageUrl) return [];
  return [
    {
      id: `v-${conceptResultKey(entry.chosenIdeaTitle)}-r${entry.revision}`,
      imageUrl: entry.resultImageUrl,
      revision: entry.revision,
      finishedAt: entry.finishedAt || new Date().toISOString(),
    },
  ];
}

/** Добавляет новую версию фото концепции, старые сохраняются в variants */
export function mergeConceptResult(
  existing: unknown,
  entry: {
    chosenIdeaTitle: string;
    resultImageUrl: string;
    productIds: string[];
    revision: number;
    finishedAt?: Date | string | null;
    refinementBrief?: string | null;
    variantId?: string;
  },
): ConceptResultsMap {
  const map = parseConceptResults(existing);
  const title = entry.chosenIdeaTitle.trim();
  const key = conceptResultKey(title);
  const prev = map[key];
  const finishedAt =
    entry.finishedAt instanceof Date
      ? entry.finishedAt.toISOString()
      : typeof entry.finishedAt === 'string'
        ? entry.finishedAt
        : new Date().toISOString();

  let variants = prev ? normalizeVariants(prev) : [];
  if (
    prev?.resultImageUrl &&
    !variants.some((v) => v.imageUrl === prev.resultImageUrl)
  ) {
    variants = [
      {
        id: `v-${key}-legacy`,
        imageUrl: prev.resultImageUrl,
        revision: prev.revision,
        finishedAt: prev.finishedAt || finishedAt,
      },
      ...variants.filter((v) => v.imageUrl !== prev.resultImageUrl),
    ];
  }

  if (!variants.some((v) => v.imageUrl === entry.resultImageUrl)) {
    variants.push({
      id: entry.variantId ?? `v-${key}-r${entry.revision}-${Date.now()}`,
      imageUrl: entry.resultImageUrl,
      revision: Math.max(1, entry.revision),
      finishedAt,
      refinementBrief: entry.refinementBrief ?? null,
    });
  }

  map[key] = {
    chosenIdeaTitle: title,
    resultImageUrl: entry.resultImageUrl,
    productIds: [...entry.productIds],
    revision: Math.max(1, entry.revision),
    finishedAt,
    variants,
  };
  return map;
}

/** Legacy: одна resultImageUrl → запись для chosenIdeaTitle из snapshot */
export function backfillConceptResultsFromGeneration(generation: {
  resultImageUrl?: string | null;
  inputSnapshot?: unknown;
  finishedAt?: Date | null;
  conceptResults?: unknown;
}): ConceptResultsMap {
  const existing = parseConceptResults(generation.conceptResults);
  if (Object.keys(existing).length > 0) {
    const normalized: ConceptResultsMap = {};
    for (const [k, v] of Object.entries(existing)) {
      normalized[k] = { ...v, variants: normalizeVariants(v) };
    }
    return normalized;
  }
  if (!generation.resultImageUrl) return existing;

  const snap = generation.inputSnapshot as
    | { chosenIdeaTitle?: string | null; productIds?: string[]; revision?: number }
    | undefined;
  const title = snap?.chosenIdeaTitle?.trim();
  if (!title) return existing;

  return mergeConceptResult(existing, {
    chosenIdeaTitle: title,
    resultImageUrl: generation.resultImageUrl,
    productIds: snap?.productIds ?? [],
    revision: Number(snap?.revision) || 1,
    finishedAt: generation.finishedAt,
  });
}

export function getConceptResult(
  conceptResults: unknown,
  chosenIdeaTitle?: string | null,
): ConceptGenerationResult | null {
  const title = chosenIdeaTitle?.trim();
  if (!title) return null;
  const map = parseConceptResults(conceptResults);
  const entry = map[conceptResultKey(title)];
  if (!entry?.resultImageUrl) return null;
  return { ...entry, variants: normalizeVariants(entry) };
}
