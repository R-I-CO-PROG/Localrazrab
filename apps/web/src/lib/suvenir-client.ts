"use client";

import type {
  CatalogProduct,
  RequestPayload,
  SuvenirRequest,
  AgentRun,
  AiGenerationStyle,
  SuvenirAsset,
} from "@/lib/suvenir-types";
import { resolveApiBase } from "@/lib/asset-url";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${resolveApiBase()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Сервер API временно недоступен (перегружен). Подождите 30 секунд и повторите попытку.",
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = JSON.parse(text) as {
        message?: string | string[];
        error?: string;
        code?: string;
        required?: number;
        available?: number;
      };
      if (err.code === "INSUFFICIENT_CREDITS") {
        if (err.required != null && err.available != null) {
          msg = `Недостаточно кредитов: нужно ${err.required}, на счёте ${err.available}`;
        } else {
          msg = err.error ?? "Недостаточно кредитов";
        }
      } else if (err.code === "UPSTREAM_UNAVAILABLE") {
        const upstreamMsg = err.message;
        msg =
          (Array.isArray(upstreamMsg) ? upstreamMsg.join(", ") : upstreamMsg) ??
          "Сервер API временно недоступен. Подождите и повторите.";
      } else {
        msg = Array.isArray(err.message) ? err.message.join(", ") : err.message ?? err.error ?? msg;
      }
    } catch {
      msg = text.trim().startsWith("<")
        ? `Ошибка сервера (HTTP ${res.status}). Обновите страницу.`
        : text.slice(0, 200) || msg;
    }
    if (msg === "Internal Server Error" || msg === "Internal server error") {
      msg =
        "Ошибка на сервере API. Если генерация уже идёт — подождите 1–2 минуты и обновите страницу.";
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export function getProducts(params?: {
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.search) q.set("search", params.search);
  if (params?.page) q.set("page", String(params.page));
  if (params?.pageSize) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  return api<CatalogProduct[] | { items: CatalogProduct[] }>(
    `/products${qs ? `?${qs}` : ""}`,
  ).then((data) => (Array.isArray(data) ? data : (data.items ?? [])));
}

export function parseBrief(userPrompt: string) {
  return api<import("@/lib/brief-autofill").ParsedBriefResponse>("/requests/parse-brief", {
    method: "POST",
    body: JSON.stringify({ userPrompt }),
  });
}

export function createRequest(data: RequestPayload) {
  return api<SuvenirRequest>("/requests", { method: "POST", body: JSON.stringify(data) });
}

export function getRequest(id: string) {
  return api<SuvenirRequest>(`/requests/${id}`);
}

export function updateRequest(id: string, data: RequestPayload) {
  return api<SuvenirRequest>(`/requests/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function submitRequest(id: string) {
  return api<SuvenirRequest>(`/requests/${id}/submit`, { method: "POST" });
}

export function suggestProducts(id: string) {
  return api<{
    request: SuvenirRequest;
    suggestion: {
      productIds: string[];
      productNames: string[];
      composition: string;
      style: string;
      usedFallback: boolean;
    };
  }>(`/requests/${id}/suggest-products`, { method: "POST" });
}

export function generateRequest(
  id: string,
  options?: {
    mode?: "mockup" | "ai";
    productIds?: string[];
    aiStyle?: AiGenerationStyle;
    chosenIdeaTitle?: string;
    productTargetColors?: Array<{ productId: string; color: string }>;
    sceneBrief?: string;
    giftBoxEnabled?: boolean;
  },
) {
  return api<{ jobId: string }>(`/requests/${id}/generate`, {
    method: "POST",
    body: JSON.stringify({
      mode: options?.mode ?? "ai",
      productIds: options?.productIds,
      aiStyle: options?.aiStyle ?? "catalog",
      chosenIdeaTitle: options?.chosenIdeaTitle,
      productTargetColors: options?.productTargetColors,
      sceneBrief: options?.sceneBrief,
      giftBoxEnabled: options?.giftBoxEnabled,
    }),
  });
}

export function regenerateRequest(
  id: string,
  options?: {
    mode?: "mockup" | "ai";
    productIds?: string[];
    aiStyle?: AiGenerationStyle;
    chosenIdeaTitle?: string;
    productTargetColors?: Array<{ productId: string; color: string }>;
    sceneBrief?: string;
    giftBoxEnabled?: boolean;
  },
) {
  return api<{ jobId: string }>(`/requests/${id}/regenerate`, {
    method: "POST",
    body: JSON.stringify({
      mode: options?.mode ?? "ai",
      productIds: options?.productIds,
      aiStyle: options?.aiStyle ?? "catalog",
      chosenIdeaTitle: options?.chosenIdeaTitle,
      productTargetColors: options?.productTargetColors,
      sceneBrief: options?.sceneBrief,
      giftBoxEnabled: options?.giftBoxEnabled,
    }),
  });
}

export function refineVisualization(
  requestId: string,
  body: { refinementBrief: string; sourceImageUrl?: string; chosenIdeaTitle?: string },
) {
  return api<{ jobId: string; revision: number; refining: boolean }>(
    `/requests/${requestId}/refine-visualization`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

/** Прикрепить логотип из формы, если в request ещё нет logo asset */
export async function ensureRequestLogo(
  requestId: string,
  files: import("@/lib/types").ProjectFormData["files"],
): Promise<boolean> {
  const req = await getRequest(requestId);
  if (req.assets?.some((a) => a.type === "logo")) return true;
  const { logoFileFromFormFiles } = await import("@/lib/logo-from-form");
  const file = await logoFileFromFormFiles(files);
  if (!file) return false;
  await uploadAsset(requestId, file, "logo");
  return true;
}

export async function uploadAsset(requestId: string, file: File, type: "logo" | "reference") {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${resolveApiBase()}/requests/${requestId}/assets/${type}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 200) || res.statusText);
  }
  return res.json() as Promise<SuvenirAsset>;
}

export function getAgentRun(requestId: string) {
  return api<AgentRun>(`/requests/${requestId}/agent-run`);
}

export function startAgentRun(requestId: string, aiStyle: "creative" | "catalog" = "creative") {
  return api<AgentRun>(`/requests/${requestId}/agent-run`, {
    method: "POST",
    body: JSON.stringify({ aiStyle }),
  });
}

/** Повторный подбор: 5 новых концепций с теми же параметрами брифа */
export function retryAgentRun(requestId: string, aiStyle: "creative" | "catalog" = "creative") {
  return api<AgentRun>(`/requests/${requestId}/agent-run/retry`, {
    method: "POST",
    body: JSON.stringify({ aiStyle }),
  });
}

export function suggestProductAdd(
  requestId: string,
  body: { currentProductIds: string[]; hint?: string },
) {
  return api<{
    suggestions: Array<{
      product: {
        id: string;
        name: string;
        category: string;
        price?: number | null;
        stockAvailable?: number;
        colors?: string[];
        catalogImageUrl?: string | null;
        silhouetteImageUrl?: string;
        sourceUrl?: string | null;
      };
      reason: string;
      targetColor?: string;
      /** Честные отклонения от запроса/брифа: ёмкость, цвет, тираж, остаток бюджета */
      mismatches?: string[];
    }>;
    usedFallback: boolean;
  }>(`/requests/${requestId}/suggest-product-add`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function selectConcept(requestId: string, chosenIdeaTitle: string) {
  return api<AgentRun>(`/requests/${requestId}/agent-run/select`, {
    method: "POST",
    body: JSON.stringify({ chosenIdeaTitle }),
  });
}
