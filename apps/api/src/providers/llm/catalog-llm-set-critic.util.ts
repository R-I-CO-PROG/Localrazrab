import type { ConfigService } from '@nestjs/config';
import type { Concept } from '../../agents/contracts';
import type { OpenrouterAgentClient } from '../../agents/openrouter-agent.client';
import { withTimeout } from '../../common/promise-timeout.util';
import { parseAgentJson } from '../../agents/json-repair.util';
import {
  finalizeConceptSelection,
  selectionConstraintsFromFilterInput,
} from '../../concept/selection-constraints';
import { scoreBriefRelevance } from './catalog-brief-relevance.util';
import type { CatalogFilterInput } from './catalog-filter.util';
import { scoreProductForBrief } from './catalog-filter.util';
import type { CatalogProduct } from './catalog.util';
import { detectConceptProductType } from './concept-diversity.util';
import { productVariantKey } from './catalog-variant.util';

const SYSTEM_PROMPT = `You are a merchandising QA reviewer for corporate gift sets.
Return ONLY valid JSON (no markdown):
{"reviews":[{"conceptIndex":0,"keep":["id1","id2"],"replace":[{"outId":"id3","inId":"id4","reason":"short"}]}]}

Rules:
- conceptIndex is 0-based.
- keep: product ids to retain from the current set (subset of input ids).
- replace: swap outId for inId; inId MUST come from that concept's shortlist only.
- Never invent product ids. At most 2 replacements per concept.`;

interface LlmReplacePair {
  outId?: string;
  inId?: string;
  reason?: string;
}

interface LlmSetReview {
  conceptIndex?: number;
  keep?: string[];
  replace?: LlmReplacePair[];
  /** legacy */
  removeProductId?: string | null;
  reason?: string;
  scoreDelta?: number;
}

interface LlmCriticResponse {
  reviews?: LlmSetReview[];
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

/** Через закалённую лестницу parseAgentJson: голый JSON.parse отбрасывал ВЕСЬ вердикт критика
 *  из-за висячей запятой / одинарных кавычек / обрыва ответа по max_tokens. */
function parseCriticResponse(content: string): LlmCriticResponse {
  return parseAgentJson<LlmCriticResponse>(content);
}

function buildShortlist(
  concept: Concept,
  catalog: CatalogProduct[],
  brief: string,
  colors: string[],
  filterInput?: CatalogFilterInput,
  maxItems = 8,
): CatalogProduct[] {
  const usedIds = new Set((concept.catalogProducts ?? []).map((p) => p.id));
  const usedVariants = new Set(
    (concept.catalogProducts ?? []).map((p) => productVariantKey(p as CatalogProduct)),
  );

  return catalog
    .filter((p) => {
      if (usedIds.has(p.id)) return false;
      if (usedVariants.has(productVariantKey(p))) return false;
      if ((p.price ?? 0) <= 0) return false;
      if (p.stockAvailable != null && p.stockAvailable <= 0) return false;
      if (scoreBriefRelevance(p, brief, colors) <= -120) return false;
      return true;
    })
    .map((p) => ({
      product: p,
      score:
        scoreBriefRelevance(p, brief, colors) +
        (filterInput ? scoreProductForBrief(p, filterInput) * 0.3 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((s) => s.product);
}

function mapProductToConceptShape(
  p: CatalogProduct,
  brandColors: string[],
): NonNullable<Concept['catalogProducts']>[number] {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    productType: detectConceptProductType(p),
    price: p.price,
    stockAvailable: p.stockAvailable,
    colors: (p.colors ?? [])
      .map((c) => (typeof c === 'string' ? c : typeof c.name === 'string' ? c.name : ''))
      .filter(Boolean),
    catalogImageUrl: p.catalogImageUrl ?? undefined,
    imageUrl: p.catalogImageUrl ?? undefined,
    image: p.catalogImageUrl ?? undefined,
  };
}

function applyReviewToConcept(
  concept: Concept,
  review: LlmSetReview,
  catalog: CatalogProduct[],
  brief: string,
  colors: string[],
  filterInput: CatalogFilterInput | undefined,
  minProducts: number,
  maxProducts: number,
): Concept {
  const shortlist = buildShortlist(concept, catalog, brief, colors, filterInput);
  const shortlistIds = new Set(shortlist.map((p) => p.id));
  const catalogById = new Map(catalog.map((p) => [p.id, p]));

  let products = [...(concept.catalogProducts ?? [])];

  if (review.replace?.length) {
    for (const pair of review.replace) {
      const outId = pair.outId?.trim();
      const inId = pair.inId?.trim();
      if (!outId || !inId || !shortlistIds.has(inId)) continue;
      const replacement = catalogById.get(inId);
      if (!replacement) continue;
      if (!products.some((p) => p.id === outId)) continue;
      products = products.map((p) =>
        p.id === outId ? mapProductToConceptShape(replacement, colors) : p,
      );
    }
  } else if (review.removeProductId?.trim()) {
    const removeId = review.removeProductId.trim();
    const replacement = shortlist[0];
    if (replacement && products.some((p) => p.id === removeId)) {
      products = products.map((p) =>
        p.id === removeId ? mapProductToConceptShape(replacement, colors) : p,
      );
    }
  }

  // `keep` НЕ должен схлопывать набор: если LLM «оставил» меньше минимума,
  // игнорируем (иначе «оставь только полотенце» рушит весь набор до 1 предмета).
  if (review.keep?.length) {
    const keepSet = new Set(review.keep);
    const kept = products.filter((p) => keepSet.has(p.id));
    if (kept.length >= Math.min(minProducts, products.length)) products = kept;
  }

  const catalogProducts = products
    .map((cp) => catalogById.get(cp.id) ?? ({ id: cp.id, name: cp.name, category: cp.category ?? '' } as CatalogProduct))
    .filter((p) => p.id);

  const selectionInput = selectionConstraintsFromFilterInput(
    filterInput ?? {
      userPrompt: brief,
      colors,
      allowedItems: [],
      forbiddenItems: [],
    },
    { min: minProducts, max: maxProducts },
  );

  const { products: finalized } = finalizeConceptSelection(catalogProducts, selectionInput, {
    catalog,
    filterInput,
    conceptTitle: concept.title,
    conceptComposition: concept.composition ?? '',
  });

  const nextProducts = finalized.map((p) => mapProductToConceptShape(p, colors));
  const risks = [...(concept.risks ?? [])];
  for (const pair of review.replace ?? []) {
    if (pair.reason) risks.push(`LLM critic: ${pair.reason}`);
  }
  if (review.reason && !review.replace?.length) risks.push(`LLM critic: ${review.reason}`);

  return {
    ...concept,
    catalogProducts: nextProducts,
    productIds: nextProducts.map((p) => p.id),
    score: concept.score,
    risks: risks.length ? risks : concept.risks,
  };
}

/** Runtime-переключатель: null = читать из env, true/false = явное значение */
let criticRuntimeEnabled: boolean | null = null;

export function setCriticRuntimeEnabled(val: boolean | null): void {
  criticRuntimeEnabled = val;
}

export function getCriticRuntimeEnabled(): boolean | null {
  return criticRuntimeEnabled;
}

/** Опциональный LLM-критик наборов после enforceGlobalConceptUniqueness */
export async function critiqueConceptSetsWithLlm(
  concepts: Concept[],
  brief: string,
  catalog: CatalogProduct[],
  colors: string[],
  openrouter: OpenrouterAgentClient,
  config: ConfigService,
  logWarn: (message: string) => void,
  filterInput?: CatalogFilterInput,
  minProductsPerSet = 4,
  maxProductsPerSet = 7,
): Promise<Concept[]> {
  const enabled =
    criticRuntimeEnabled !== null
      ? criticRuntimeEnabled
      : config.get<string>('CATALOG_LLM_CRITIC', 'false') === 'true';
  if (!enabled) return concepts;
  if (!openrouter.isEnabled()) return concepts;
  if (!concepts.length) return concepts;

  const timeoutMs = Number(config.get('CATALOG_LLM_CRITIC_TIMEOUT_MS', 6000)) || 6000;
  const payload = {
    brief: brief.slice(0, 1200),
    concepts: concepts.map((c, index) => {
      const shortlist = buildShortlist(c, catalog, brief, colors, filterInput);
      return {
        index,
        title: c.title,
        composition: c.composition ?? '',
        products: (c.catalogProducts ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          type: p.productType,
          price: p.price,
        })),
        shortlist: shortlist.map((p) => ({
          id: p.id,
          name: p.name,
          type: detectConceptProductType(p),
          price: p.price,
        })),
      };
    }),
  };

  try {
    const content = await withTimeout(
      openrouter.chatJson({
        systemPrompt: SYSTEM_PROMPT,
        userMessage: JSON.stringify(payload),
        modelEnvKey: 'CATALOG_LLM_CRITIC_MODEL',
        maxTokensEnvKey: 'CATALOG_LLM_CRITIC_MAX_TOKENS',
        defaultMaxTokens: 900,
        agentName: 'CatalogLlmSetCritic',
      }),
      timeoutMs,
      'CATALOG_LLM_CRITIC',
    );

    const parsed = parseCriticResponse(content);
    const reviews = parsed.reviews ?? [];
    if (!reviews.length) return concepts;

    return concepts.map((concept, index) => {
      const review = reviews.find((r) => r.conceptIndex === index);
      if (!review) return concept;
      return applyReviewToConcept(
        concept,
        review,
        catalog,
        brief,
        colors,
        filterInput,
        minProductsPerSet,
        maxProductsPerSet,
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logWarn(`CATALOG_LLM_CRITIC fallback: ${msg}`);
    return concepts;
  }
}
