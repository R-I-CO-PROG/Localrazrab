export type OpenRouterImageModality = "image" | "text";

export interface OpenRouterImageRequest {
  apiKey: string;
  model: string;
  prompt: string;
  modalities: OpenRouterImageModality[];
  imageConfig?: {
    aspect_ratio?: string;
    image_size?: string;
  };
  referenceImageUrls?: string[];
  timeoutMs?: number;
}

function parseDataUrl(dataUrl: string): Buffer {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error("Invalid data URL in image response");
  return Buffer.from(match[2], "base64");
}

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string; image_url?: { url?: string } }>;
      images?: Array<{ image_url?: { url?: string }; imageUrl?: { url?: string } }>;
    };
  }>;
  error?: { message?: string };
}

function extractImageUrlFromResponse(json: OpenRouterImageResponse): string | null {
  const message = json.choices?.[0]?.message;
  if (!message) return null;

  const fromImages = message.images?.[0]?.image_url?.url ?? message.images?.[0]?.imageUrl?.url;
  if (fromImages) return fromImages;

  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === "image_url" && part.image_url?.url) {
        return part.image_url.url;
      }
    }
  }

  if (typeof content === "string") {
    const dataMatch = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/.exec(content);
    if (dataMatch) return dataMatch[0];
  }

  return null;
}

export async function openrouterGenerateImageBuffer(
  req: OpenRouterImageRequest,
): Promise<Buffer> {
  const apiUrl =
    process.env.OPENROUTER_API_URL?.trim() || "https://openrouter.ai/api/v1/chat/completions";
  const timeoutMs = req.timeoutMs ?? (Number(process.env.OPENROUTER_IMAGE_TIMEOUT_MS) || 180_000);

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

  for (const ref of req.referenceImageUrls ?? []) {
    if (ref?.trim()) {
      content.push({ type: "image_url", image_url: { url: ref.trim() } });
    }
  }

  content.push({ type: "text", text: req.prompt });

  const body: Record<string, unknown> = {
    model: req.model,
    messages: [{ role: "user", content }],
    modalities: req.modalities,
  };
  if (req.imageConfig && Object.keys(req.imageConfig).length > 0) {
    body.image_config = req.imageConfig;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://mercai.ru",
        "X-Title": process.env.OPENROUTER_APP_NAME || "Mercai",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenRouter image HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = JSON.parse(text) as OpenRouterImageResponse;
    const imageUrl = extractImageUrlFromResponse(json);
    if (!imageUrl) {
      throw new Error("OpenRouter image: no image in response");
    }

    if (imageUrl.startsWith("data:")) {
      return parseDataUrl(imageUrl);
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch generated image: ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

export function isImageProviderConfigured(): boolean {
  const provider = (process.env.AI_IMAGE_PROVIDER ?? "openrouter").toLowerCase();
  if (provider === "none" || provider === "disabled") return false;
  if (process.env.AI_SKIP_OPENROUTER_IMAGE === "true") return false;
  return Boolean((process.env.OPENROUTER_API_KEY ?? "").trim());
}

export function resolveImageModel(): string {
  return (
    process.env.AI_IMAGE_MODEL?.trim() ||
    process.env.OPENROUTER_IMAGE_MODEL_FINAL?.trim() ||
    "google/gemini-2.5-flash-image"
  );
}
