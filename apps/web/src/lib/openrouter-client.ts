interface OpenRouterChatOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_FALLBACKS = [
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash",
];

function isSkipModel(msg: string): boolean {
  return (
    msg.includes("404") ||
    msg.includes("No endpoints") ||
    msg.includes("unavailable") ||
    msg.includes("not found")
  );
}

function isJsonModeError(msg: string): boolean {
  return (
    msg.includes("response_format") ||
    msg.includes("json_object") ||
    msg.includes("unexpected tokens")
  );
}

function resolveModels(primary: string, forceFallbacks = true): string[] {
  const single = !forceFallbacks && process.env.OPENROUTER_SINGLE_MODEL === "true";
  const extra = (process.env.OPENROUTER_FALLBACK_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [primary, ...extra, ...DEFAULT_FALLBACKS];
  return single ? [primary] : [...new Set(chain)];
}

function getApiKey(): string {
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!key) throw new Error("OPENROUTER_API_KEY не настроен");
  return key;
}

export function isOpenRouterEnabled(): boolean {
  return (
    process.env.OPENROUTER_ENABLED !== "false" &&
    Boolean((process.env.OPENROUTER_API_KEY ?? "").trim())
  );
}

async function callOnce(
  apiKey: string,
  apiUrl: string,
  model: string,
  opts: OpenRouterChatOptions,
  maxTokens: number,
  timeoutMs: number,
  jsonMode: boolean,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userMessage },
      ],
      temperature: opts.temperature ?? 0.4,
      max_tokens: maxTokens,
    };
    if (jsonMode) body.response_format = { type: "json_object" };

    const response = await fetch(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://mercai.ru",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "Mercai",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      const preview = text.trimStart().startsWith("<")
        ? "сервер вернул HTML вместо JSON"
        : text.slice(0, 300);
      throw new Error(`HTTP ${response.status}: ${preview}`);
    }

    if (text.trimStart().startsWith("<")) {
      throw new Error("OpenRouter вернул HTML вместо JSON");
    }

    let data: {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new Error(`Некорректный JSON от OpenRouter: ${text.slice(0, 200)}`);
    }
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(data.error?.message ?? "Пустой ответ OpenRouter");
    }
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Таймаут OpenRouter (${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function openRouterChatJson(opts: OpenRouterChatOptions): Promise<string> {
  if (!isOpenRouterEnabled()) {
    throw new Error("OpenRouter отключён или не настроен API-ключ");
  }

  const apiKey = getApiKey();
  const primary =
    opts.model ??
    process.env.OPENROUTER_MODEL_PRESENTATION ??
    process.env.OPENROUTER_MODEL ??
    "openai/o4-mini";
  const maxTokens =
    opts.maxTokens ??
    (Number(process.env.OPENROUTER_MAX_TOKENS_PRESENTATION) || 8000);
  const apiUrl =
    process.env.OPENROUTER_API_URL ?? "https://openrouter.ai/api/v1/chat/completions";
  const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS) || 120_000;
  const models = resolveModels(primary, true);
  const errors: string[] = [];

  for (const model of models) {
    try {
      let content = "";
      for (const jsonMode of [true, false] as const) {
        try {
          content = await callOnce(apiKey, apiUrl, model, opts, maxTokens, timeoutMs, jsonMode);
          if (content.trim()) break;
        } catch (callErr) {
          const msg = callErr instanceof Error ? callErr.message : String(callErr);
          if (jsonMode && isJsonModeError(msg)) continue;
          throw callErr;
        }
      }
      if (content.trim()) return content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${model}: ${msg.slice(0, 120)}`);
    }
  }

  throw new Error(
    `Не удалось получить ответ от AI (${errors.length} попыток). ${errors[errors.length - 1] ?? ""}`,
  );
}
