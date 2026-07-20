import type { CatalogIdeatorIdea } from '../../agents/contracts';
import {
  isSimilarConceptTitle,
  normalizeConceptKey,
  type GenerationHistory,
} from '../../agents/previous-generation.util';

export function catalogIdeaSlotSignature(idea: {
  productSlots?: Array<{ type: string }>;
  title?: string;
}): string {
  const slots = idea.productSlots ?? [];
  if (slots.length) {
    return [...slots.map((s) => s.type)].sort().join('|');
  }
  return `title:${String(idea.title ?? '').trim().toLowerCase()}`;
}

function ideaSlotTypes(idea: {
  productSlots?: Array<{ type: string }>;
  title?: string;
}): Set<string> {
  const slots = idea.productSlots ?? [];
  if (!slots.length) return new Set();
  return new Set(slots.map((s) => s.type));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isSimilarSlotSet(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  return jaccardSimilarity(a, b) >= 0.6;
}

/** Отбирает до `limit` идей с уникальными наборами типов и themeAxis */
export function pickDiverseCatalogIdeas<T extends { title: string }>(
  ranked: T[],
  ideasByTitle: Map<string, CatalogIdeatorIdea>,
  limit: number,
  generationHistory?: GenerationHistory | null,
): T[] {
  const blockedTitles = generationHistory?.conceptTitles ?? [];
  const blockedAxes = new Set(
    (generationHistory?.themeAxes ?? []).map((a) => normalizeConceptKey(a)),
  );
  const picked: T[] = [];
  const pickedTypeSets: Set<string>[] = [];
  const usedTitleSigs = new Set<string>();
  const usedSignatures = new Set<string>();
  const usedAxes = new Set<string>();

  for (const item of ranked) {
    if (picked.length >= limit) break;
    if (blockedTitles.some((t) => isSimilarConceptTitle(t, item.title))) continue;
    const full = ideasByTitle.get(item.title);
    const candidateTypes = full ? ideaSlotTypes(full) : new Set<string>();
    const axis = String(full?.themeAxis ?? '')
      .trim()
      .toLowerCase();

    if (axis && blockedAxes.has(normalizeConceptKey(axis))) continue;

    if (candidateTypes.size > 0) {
      const duplicate = pickedTypeSets.some((picked) =>
        isSimilarSlotSet(candidateTypes, picked),
      );
      if (duplicate) continue;
    } else {
      const sig = full ? catalogIdeaSlotSignature(full) : item.title;
      if (usedTitleSigs.has(sig)) continue;
    }

    if (axis && usedAxes.has(axis)) continue;
    picked.push(item);
    if (candidateTypes.size > 0) {
      pickedTypeSets.push(candidateTypes);
    } else {
      const sig = full ? catalogIdeaSlotSignature(full) : item.title;
      usedTitleSigs.add(sig);
    }
    if (axis) usedAxes.add(axis);
  }

  if (picked.length >= limit) return picked;

  for (const item of ranked) {
    if (picked.length >= limit) break;
    if (picked.some((p) => p.title === item.title)) continue;
    const full = ideasByTitle.get(item.title);
    const sig = full ? catalogIdeaSlotSignature(full) : item.title;
    if (usedSignatures.has(sig)) continue;
    picked.push(item);
    usedSignatures.add(sig);
  }

  // Гарантированный добор до limit: лучше взять похожую по теме идею, чем строить
  // медленные fallback-концепции (релаксация на суженном пуле ~10с/набор).
  // Разнообразие ТОВАРОВ всё равно обеспечивают подбор + уникальность SKU между наборами.
  if (picked.length < limit) {
    const pickedTitles = new Set(picked.map((p) => p.title));
    for (const item of ranked) {
      if (picked.length >= limit) break;
      if (pickedTitles.has(item.title)) continue;
      picked.push(item);
      pickedTitles.add(item.title);
    }
  }

  return picked;
}
