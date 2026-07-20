import { LlmGenerationInput, LlmGenerationOutput } from './llm.interface';
import { parseAgentJson } from '../../agents/json-repair.util';

export function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export interface LlmBriefParseJson {
  category?: string;
  quantity?: number;
  set_item_count?: number;
  budget_min?: number;
  budget_max?: number;
  budget_scope?: 'per_set' | 'total';
  colors?: string[];
  allowed_items?: string[];
  named_items?: string[];
  forbidden_items?: string[];
  forbidden_named?: string[];
  mandatory_types?: string[];
  alternative_type_groups?: string[][];
  notes?: string;
}

export interface LlmCatalogConceptJson {
  title: string;
  composition: string;
  style: string;
  items: string[];
}

export interface LlmCatalogConceptsJson {
  concepts: LlmCatalogConceptJson[];
}

export function parseCatalogConceptsJson(content: string): LlmCatalogConceptsJson {
  const parsed = parseAgentJson<Partial<LlmCatalogConceptsJson>>(content);
  if (!Array.isArray(parsed.concepts) || parsed.concepts.length === 0) {
    throw new Error('LLM response missing concepts array');
  }
  return { concepts: parsed.concepts };
}

export function parseLlmBriefJson(content: string): LlmBriefParseJson {
  return parseAgentJson<LlmBriefParseJson>(content);
}

export interface CatalogSelectorChoiceJson {
  slotIndex: number;
  productId: string | null;
  reason?: string;
}

export interface CatalogSelectorJson {
  choices: CatalogSelectorChoiceJson[];
  coherenceNote?: string;
}

export interface CatalogComposeJson {
  productIds: string[];
  coherenceNote?: string;
}

/** Парсит ответ байера-композитора: {"productIds":[...],"coherenceNote":"..."}.
 *  Через parseAgentJson (та же закалённая лестница, что у идеатора): голый JSON.parse отбрасывал
 *  ВЕСЬ набор из-за висячей запятой/одинарных кавычек/обрыва по max_tokens. */
export function parseCatalogComposeJson(content: string): CatalogComposeJson {
  const parsed = parseAgentJson<{ productIds?: unknown; items?: unknown; coherenceNote?: unknown }>(content);
  const rawList = Array.isArray(parsed.productIds)
    ? parsed.productIds
    : Array.isArray(parsed.items)
      ? parsed.items
      : null;
  if (!rawList) throw new Error('Compose response missing productIds array');
  const productIds = rawList
    .map((x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : ''))
    .filter((s) => s.length > 0);
  return {
    productIds,
    coherenceNote: typeof parsed.coherenceNote === 'string' ? parsed.coherenceNote : undefined,
  };
}

/** Парсит ответ нейро-байера. Бросает при отсутствии валидного массива choices.
 *  Через parseAgentJson — см. комментарий у parseCatalogComposeJson. */
export function parseCatalogSelectorJson(content: string): CatalogSelectorJson {
  const parsed = parseAgentJson<Partial<CatalogSelectorJson>>(content);
  if (!Array.isArray(parsed.choices)) {
    throw new Error('Catalog selector response missing choices array');
  }
  const choices: CatalogSelectorChoiceJson[] = parsed.choices
    .filter((c) => c && typeof c.slotIndex === 'number')
    .map((c) => ({
      slotIndex: c.slotIndex,
      productId:
        typeof c.productId === 'string' && c.productId.trim()
          ? c.productId.trim()
          : null,
      reason: typeof c.reason === 'string' ? c.reason : undefined,
    }));
  return {
    choices,
    coherenceNote:
      typeof parsed.coherenceNote === 'string' ? parsed.coherenceNote : undefined,
  };
}

export function buildLlmOutputFromContent(
  content: string,
  input: LlmGenerationInput,
): LlmGenerationOutput {
  if (input.briefParseMode) {
    const parsed = parseLlmBriefJson(content);
    return {
      items: [],
      composition: JSON.stringify(parsed),
      style: '',
      image_prompt: 'brief-parse',
      negative_prompt: '',
    };
  }

  if (input.catalogConceptsMode) {
    const parsed = parseCatalogConceptsJson(content);
    return {
      items: [],
      composition: JSON.stringify(parsed),
      style: '',
      image_prompt: 'catalog-concepts',
      negative_prompt: '',
    };
  }

  if (input.productAddMode) {
    const jsonText = extractJsonObject(content.trim());
    const parsed = JSON.parse(jsonText) as {
      items?: string[];
      reason?: string;
      reasons?: string[];
      suggestions?: Array<{ name?: string; reason?: string }>;
    };

    if (parsed.suggestions?.length) {
      const names = parsed.suggestions.map((s) => s.name).filter(Boolean) as string[];
      const reasons = parsed.suggestions.map((s) => s.reason ?? '');
      return {
        items: names,
        composition: JSON.stringify(reasons),
        style: '',
        image_prompt: 'product-add',
        negative_prompt: '',
      };
    }

    const items = parsed.items ?? [];
    const reasons =
      parsed.reasons ??
      (parsed.reason ? items.map((_, i) => (i === 0 ? parsed.reason! : '')) : []);
    return {
      items,
      composition: reasons.length ? JSON.stringify(reasons) : parsed.reason ?? '',
      style: '',
      image_prompt: 'product-add',
      negative_prompt: '',
    };
  }

  const output = parseLlmJson(content);
  if (input.creativeMode) {
    output.items = [];
  } else if (input.sceneOnly && input.productNames.length > 0) {
    output.items = [...input.productNames];
  }
  return output;
}

export function parseLlmJson(content: string): LlmGenerationOutput {
  const jsonText = extractJsonObject(content.trim());
  const parsed = JSON.parse(jsonText) as Partial<LlmGenerationOutput>;

  if (!parsed.image_prompt?.trim()) {
    throw new Error('LLM response missing image_prompt');
  }

  return {
    items: parsed.items ?? [],
    composition: parsed.composition ?? '',
    style: parsed.style ?? '',
    image_prompt: parsed.image_prompt.trim(),
    negative_prompt: parsed.negative_prompt?.trim() ?? 'blurry, low quality, watermark, text, logo',
  };
}
