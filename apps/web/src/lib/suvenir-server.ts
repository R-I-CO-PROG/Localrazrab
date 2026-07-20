import "server-only";

import type { ConceptGenerationInput } from "@/lib/generation-payload";
import { clampInt, LIMITS } from "@/lib/sanitize-int";
import type { GeneratedConcept, ProjectSummary } from "@/lib/types";
import { buildConceptNarrativeFromParts } from "@/lib/concept-narrative";
import type { ParsedBriefResponse } from "@/lib/brief-autofill";
import type { AgentConcept, AgentRunState } from "@/lib/agent-types";
import { buildProjectTitle, isGenericProjectTitle } from "@/lib/project-title";

export type { AgentConcept, AgentRunState } from "@/lib/agent-types";

const API_URL = process.env.SUVENIR_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const API_SECRET = process.env.API_SECRET_KEY?.trim() ?? "";

function apiHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(API_SECRET ? { "X-API-Key": API_SECRET } : {}),
    ...extra,
  };
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: apiHeaders(options?.headers),
      cache: "no-store",
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "cause" in err
        ? String((err as { cause?: { code?: string } }).cause?.code ?? "")
        : "";
    if (code === "ECONNREFUSED" || code === "ECONNRESET") {
      throw new Error(
        "Сервер API временно недоступен (перегружен). Подождите 30 секунд и повторите попытку.",
      );
    }
    throw err;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const raw = err.message;
    const msg = Array.isArray(raw)
      ? raw.join(", ")
      : typeof raw === "string"
        ? raw
        : res.statusText;
    if (msg === "Internal Server Error" || msg === "Internal server error") {
      throw new Error(
        "Ошибка на сервере API. Если генерация уже идёт — подождите 1–2 минуты и обновите страницу.",
      );
    }
    throw new Error(msg || `HTTP ${res.status} ${path}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

interface SuvenirProduct {
  id: string;
  name: string;
  category: string;
  price?: number | null;
  colors?: string[];
  description?: string | null;
  subcategory?: string | null;
}

interface SuvenirRequestItem {
  product: SuvenirProduct;
}

interface SuvenirGeneration {
  status: string;
  resultImageUrl?: string | null;
  llmOutput?: Record<string, unknown> | null;
}

interface SuvenirRequest {
  id: string;
  title: string;
  userPrompt: string;
  category: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  quantity?: number | null;
  status: string;
  items: SuvenirRequestItem[];
  generation?: SuvenirGeneration | null;
  agentRun?: AgentRunState | null;
}

interface JobStatus {
  state: string;
  failedReason?: string;
}

function mapCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    WELCOME_PACK: "Welcome Pack",
    CORPORATE_MERCH: "Корпоративный мерч",
    CLIENT_GIFTS: "Подарки клиентам",
    PARTNER_GIFTS: "Подарки партнёрам",
    CONFERENCE: "Конференция",
    EXHIBITION: "Выставка",
    NEW_YEAR: "Новый год",
    HR_EVENT: "HR-мероприятие",
    BRANDED_SET: "Брендированный набор",
    SPECIAL_PROJECT: "Спецпроект",
  };
  return map[category] ?? category;
}

function buildSuvenirRequestBody(input: ConceptGenerationInput) {
  const isCatalog = input.generationMode === "catalog";
  const quantity = clampInt(input.quantity, LIMITS.quantity);
  const budget = clampInt(input.budget, LIMITS.budget);
  const totalBudget = clampInt(input.totalBudget, LIMITS.budget);
  const budgetPerSet = Math.max(LIMITS.budget.min, budget);

  const budgetMinRaw = isCatalog
    ? budgetPerSet
    : input.budgetMode === "per_unit"
      ? budget
      : undefined;
  const budgetMaxRaw = isCatalog
    ? budgetPerSet
    : input.budgetMode === "total"
      ? totalBudget
      : totalBudget || budget * quantity;

  return {
    title: buildProjectTitle({
      description: input.description,
      category: input.category,
      quantity,
    }).slice(0, 80),
    userPrompt: input.description.slice(0, 1500),
    category: mapCategoryLabel(input.category),
    budgetMin: budgetMinRaw != null ? clampInt(budgetMinRaw, LIMITS.budget) : undefined,
    budgetMax: budgetMaxRaw != null ? clampInt(budgetMaxRaw, LIMITS.budget) : undefined,
    quantity,
    setItemCount: isCatalog ? clampInt(input.setItemCount, LIMITS.setItems) : undefined,
    useProductCountLimit: isCatalog ? input.useProductCountLimit !== false : false,
    minProductsPerSet: isCatalog && input.useProductCountLimit
      ? clampInt(input.minProductsPerSet || input.setItemCount || 4, LIMITS.setItems)
      : undefined,
    maxProductsPerSet: isCatalog && input.useProductCountLimit
      ? clampInt(input.maxProductsPerSet || input.setItemCount || 4, LIMITS.setItems)
      : undefined,
    conceptCount: clampInt(input.conceptCount, LIMITS.conceptCount),
    visualizationCount: clampInt(input.visualizationCount, LIMITS.visualizationCount),
    colors: input.colors,
    allowedItems: isCatalog ? input.allowedItems : [],
    forbiddenItems: isCatalog ? input.excludedItems : [],
    blacklistedProductIds: input.blacklistedProductIds,
    blacklistedSupplierIds: input.blacklistedSupplierIds,
    productIds: input.selectedProductIds?.length ? input.selectedProductIds : undefined,
  };
}

export function resolveImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function parseAgentConcepts(run: AgentRunState): AgentConcept[] {
  if (run.conceptsOutput?.length) {
    return run.conceptsOutput.map((c) => ({
      ...c,
      narrative: c.narrative || c.description,
      previewImageUrl: (c as { previewImageUrl?: string }).previewImageUrl,
    }));
  }
  const critic = run.criticOutput as {
    topIdeas?: Array<{ title: string; score: number; conceptSummary?: string; reasons: string[] }>;
  } | null;
  const ideator = run.ideatorOutput as {
    ideas?: Array<{ title: string; description: string; whyItFits: string; styleTags: string[] }>;
  } | null;
  if (!critic?.topIdeas?.length) return [];
  const byTitle = new Map((ideator?.ideas ?? []).map((i) => [i.title, i]));
  return critic.topIdeas.slice(0, 5).map((top) => {
    const full = byTitle.get(top.title);
    return {
      title: top.title,
      narrative: buildConceptNarrativeFromParts(full, top),
      description: full?.description ?? top.conceptSummary ?? top.title,
      score: top.score,
      styleTags: full?.styleTags,
      whyItFits: full?.whyItFits,
    };
  });
}

function buildCatalogConceptDescription(
  llm: Record<string, unknown>,
  request: SuvenirRequest,
  products: SuvenirProduct[],
): string {
  const sections: string[] = [];
  const composition = String(llm.composition ?? "").trim();
  const style = String(llm.style ?? "").trim();

  if (composition) sections.push(composition);
  if (style) sections.push(`Стиль и подача: ${style}`);

  if (products.length > 0) {
    const lines = products.map((p) => {
      const meta = [p.category, p.subcategory, p.colors?.length ? p.colors.join(", ") : ""]
        .filter(Boolean)
        .join(" · ");
      const price =
        p.price != null && p.price > 0 ? ` — ${Math.round(p.price).toLocaleString("ru-RU")} ₽` : "";
      return `• ${p.name}${meta ? ` (${meta})` : ""}${price}`;
    });
    sections.push(`Подобранные товары (${products.length}):\n${lines.join("\n")}`);
  }

  const brief = request.userPrompt?.trim();
  if (brief && !composition.includes(brief.slice(0, 80))) {
    sections.push(`Задача клиента: ${brief.slice(0, 800)}`);
  }

  return sections.join("\n\n").slice(0, 4000);
}

function mapToConcepts(request: SuvenirRequest, imageUrl?: string): GeneratedConcept[] {
  const llm = (request.generation?.llmOutput ?? {}) as Record<string, unknown>;
  const style = String(llm.style ?? "");
  const itemsFromLlm = Array.isArray(llm.items) ? (llm.items as string[]) : [];
  const products = request.items?.map((i) => i.product).filter(Boolean) ?? [];

  const conceptItems =
    products.length > 0
      ? products.map((p) => ({
          name: p.name,
          description:
            [p.description, p.category, p.subcategory, p.colors?.join(", ")]
              .filter(Boolean)
              .join(" · ") || p.category,
          price:
            p.price != null && p.price > 0
              ? Math.round(p.price)
              : Math.round(
                  (request.budgetMax ?? request.budgetMin ?? 3000) / Math.max(products.length, 1),
                ),
        }))
      : itemsFromLlm.map((name) => ({
          name,
          description: request.category,
          price: request.budgetMin ?? 500,
        }));

  const itemsTotal = conceptItems.reduce((sum, item) => sum + item.price, 0);
  const totalCost =
    itemsTotal > 0
      ? itemsTotal
      : (request.budgetMax ?? (request.budgetMin ?? 0) * (request.quantity ?? 1));
  const tags = [request.category, style, "Каталог"].filter(Boolean);
  const conceptId = `concept-${request.id}`;
  const composition = String(llm.composition ?? "").trim();
  const conceptName =
    String(llm.title ?? "").trim() ||
    (composition ? composition.split(/[.!?]/)[0]?.trim().slice(0, 100) : "") ||
    request.title ||
    "AI-набор из каталога";

  return [
    {
      id: conceptId,
      name: conceptName,
      description: buildCatalogConceptDescription(llm, request, products),
      items:
        conceptItems.length > 0
          ? conceptItems
          : [{ name: "Набор мерча", description: request.category, price: totalCost }],
      totalCost,
      tags: [...new Set(tags)].slice(0, 6),
    },
  ];
}

function mapToProject(request: SuvenirRequest, input: ConceptGenerationInput): ProjectSummary {
  const title =
    request.title && !isGenericProjectTitle(request.title)
      ? request.title
      : buildProjectTitle({
          description: input.description,
          category: input.category,
          quantity: input.quantity,
        });
  return {
    id: request.id,
    title,
    category: mapCategoryLabel(input.category),
    budget: input.budgetMode === "total" ? input.totalBudget : input.budget,
    quantity: input.quantity,
    conceptsCount: 0,
    createdAt: new Date().toISOString(),
    status: "concepts",
    requestId: request.id,
    generationMode: input.generationMode,
    briefExcerpt: input.description.slice(0, 160),
  };
}

async function pollJob(jobId: string, requestId: string, maxMs = 600_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const job = await api<JobStatus>(`/jobs/${jobId}`);
    if (job.state === "completed") return;
    if (job.state === "failed") {
      throw new Error(job.failedReason || "Generation failed");
    }
    const req = await api<SuvenirRequest>(`/requests/${requestId}`);
    if (req.status === "done") return;
    if (req.status === "failed") throw new Error("Генерация не удалась на сервере");
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Генерация заняла слишком долго. Попробуйте позже или режим «Каталог».");
}

async function pollAgentRun(requestId: string, maxMs = 300_000): Promise<AgentRunState> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const run = await api<AgentRunState>(`/requests/${requestId}/agent-run`);
    if (run.status === "awaiting_idea_selection" || run.status === "idea_selected") return run;
    if (run.status === "failed") throw new Error(run.error || "Подбор концепций не удался");
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Подбор концепций занял слишком долго");
}

export async function uploadLogoToSuvenir(requestId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/requests/${requestId}/assets/logo`, {
    method: "POST",
    headers: API_SECRET ? { "X-API-Key": API_SECRET } : undefined,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    const raw = err.message;
    const msg = Array.isArray(raw)
      ? raw.join(", ")
      : typeof raw === "string"
        ? raw
        : res.statusText;
    throw new Error(msg || `Logo upload failed (${res.status})`);
  }
}

export async function parseBriefFromText(userPrompt: string): Promise<ParsedBriefResponse> {
  return api<ParsedBriefResponse>("/requests/parse-brief", {
    method: "POST",
    body: JSON.stringify({ userPrompt }),
  });
}

export interface ExtractParametersResponse {
  request: SuvenirRequest;
  parameters: Record<string, unknown>;
  parsed?: ParsedBriefResponse;
}

export async function extractParametersForRequest(requestId: string): Promise<ExtractParametersResponse> {
  return api<ExtractParametersResponse>(`/requests/${requestId}/extract-parameters`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface SuggestProductsResult {
  requestId: string;
  productIds: string[];
  productNames: string[];
  products?: Array<{
    id: string;
    name: string;
    category: string;
    price?: number | null;
    stockAvailable?: number;
    colors?: string[];
  }>;
  setPriceRub?: number | null;
  catalogStats?: { totalInDb?: number; afterFilters?: number; sentToLlm?: number };
  composition: string;
  style: string;
  usedFallback: boolean;
}

async function upsertDraftRequest(
  input: ConceptGenerationInput,
  logoFile?: File | null,
  existingRequestId?: string,
): Promise<string> {
  const body = buildSuvenirRequestBody(input);

  const tryUploadLogo = async (requestId: string) => {
    if (!logoFile) return;
    await uploadLogoToSuvenir(requestId, logoFile);
  };

  if (existingRequestId) {
    try {
      const existing = await api<SuvenirRequest>(`/requests/${existingRequestId}`);
      const editable = new Set(["draft", "done", "failed"]);
      if (editable.has(existing.status)) {
        await api<SuvenirRequest>(`/requests/${existingRequestId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        await tryUploadLogo(existingRequestId);
        return existingRequestId;
      }
    } catch {
      // stale / non-editable request — create fresh below
    }
  }

  const request = await api<SuvenirRequest>("/requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
  await tryUploadLogo(request.id);
  return request.id;
}

export async function suggestProductsFromBrief(
  input: ConceptGenerationInput,
  logoFile?: File | null,
  existingRequestId?: string,
): Promise<SuggestProductsResult> {
  if (!input.description.trim()) {
    throw new Error("Сначала опишите задачу в брифе");
  }

  const requestId = await upsertDraftRequest(input, logoFile, existingRequestId);
  const result = await api<{
    request: SuvenirRequest;
    suggestion: {
      productIds: string[];
      productNames: string[];
      products?: SuggestProductsResult["products"];
      setPriceRub?: number | null;
      catalogStats?: SuggestProductsResult["catalogStats"];
      composition: string;
      style: string;
      usedFallback: boolean;
    };
  }>(`/requests/${requestId}/suggest-products`, { method: "POST" });

  return {
    requestId,
    productIds: result.suggestion.productIds,
    productNames: result.suggestion.productNames,
    products: result.suggestion.products,
    setPriceRub: result.suggestion.setPriceRub,
    catalogStats: result.suggestion.catalogStats,
    composition: result.suggestion.composition,
    style: result.suggestion.style,
    usedFallback: result.suggestion.usedFallback,
  };
}

export async function prepareSuvenirRequest(
  input: ConceptGenerationInput,
  logoFile?: File | null,
  existingRequestId?: string,
): Promise<{ requestId: string; project: ProjectSummary }> {
  const reuseId = existingRequestId ?? input.requestId;

  if (reuseId) {
    try {
      const existing = await api<SuvenirRequest>(`/requests/${reuseId}`);
      if (existing.status === "ready" && !logoFile) {
        return { requestId: reuseId, project: mapToProject(existing, input) };
      }
    } catch {
      // ignore stale id
    }
  }

  const requestId = await upsertDraftRequest(input, logoFile, reuseId);
  await api(`/requests/${requestId}/submit`, { method: "POST" });
  const request = await api<SuvenirRequest>(`/requests/${requestId}`);
  return { requestId, project: mapToProject(request, input) };
}

export async function discoverCreativeConcepts(
  requestId: string,
): Promise<{ agentRun: AgentRunState; concepts: AgentConcept[] }> {
  await api<AgentRunState>(`/requests/${requestId}/agent-run`, {
    method: "POST",
    body: JSON.stringify({ aiStyle: "creative" }),
  });
  const agentRun = await pollAgentRun(requestId);
  const concepts = parseAgentConcepts(agentRun);
  if (!concepts.length) throw new Error("Агенты не вернули концепции — попробуйте ещё раз");
  return { agentRun, concepts };
}

export async function selectCreativeConcept(requestId: string, chosenIdeaTitle: string): Promise<void> {
  await api(`/requests/${requestId}/agent-run/select`, {
    method: "POST",
    body: JSON.stringify({ chosenIdeaTitle }),
  });
}

export async function renderSuvenirGeneration(
  requestId: string,
  input: ConceptGenerationInput,
  opts?: { chosenIdeaTitle?: string },
): Promise<{ project: ProjectSummary; concepts: GeneratedConcept[]; imageUrl?: string }> {
  const isCreative = input.generationMode === "creative";
  const mode = "ai";
  const aiStyle = isCreative ? "creative" : "catalog";

  const job = await api<{ jobId: string }>(`/requests/${requestId}/generate`, {
    method: "POST",
    body: JSON.stringify({
      mode,
      aiStyle,
      chosenIdeaTitle: opts?.chosenIdeaTitle,
      productIds: input.selectedProductIds?.length ? input.selectedProductIds : undefined,
    }),
  });

  await pollJob(job.jobId, requestId);
  const result = await api<SuvenirRequest>(`/requests/${requestId}`);
  const imageUrl = resolveImageUrl(result.generation?.resultImageUrl);
  return {
    project: mapToProject(result, input),
    concepts: mapToConcepts(result),
    imageUrl,
  };
}

/** Каталог: один вызов. Креатив: только подготовка request (далее discover → select → render). */
export async function runSuvenirGeneration(
  input: ConceptGenerationInput,
  logoFile?: File | null,
): Promise<{ project: ProjectSummary; concepts: GeneratedConcept[]; imageUrl?: string }> {
  const { requestId, project } = await prepareSuvenirRequest(
    input,
    logoFile,
    input.requestId,
  );
  if (input.generationMode === "creative") {
    throw new Error("Use discoverCreativeConcepts + renderSuvenirGeneration for creative mode");
  }
  const rendered = await renderSuvenirGeneration(requestId, input);
  return { ...rendered, project: rendered.project ?? project };
}

export { API_URL };
