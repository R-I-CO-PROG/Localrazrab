import { Logger } from '@nestjs/common';
import { openRouterFetch } from '../llm/openrouter-proxy.util';
import { safeJsonParse } from '../llm/safe-json-parse.util';

export type OpenRouterImageModality = 'image' | 'text';

export interface OpenRouterImageRequest {
  apiKey: string;
  model: string;
  prompt: string;
  modalities: OpenRouterImageModality[];
  imageConfig?: {
    aspect_ratio?: string;
    image_size?: string;
  };
  /** Data URI or public https URL */
  referenceImageUrls?: string[];
  /** Референсы с подписью перед картинкой (лучше для логотипа) */
  referenceImages?: Array<{ url: string; preamble?: string }>;
  timeoutMs?: number;
  logger?: Logger;
}

export interface OpenRouterChatMessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url?: string };
}

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      content?: string | OpenRouterChatMessageContentPart[];
      images?: Array<{
        type?: string;
        image_url?: { url?: string };
        imageUrl?: { url?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

function parseDataUrl(dataUrl: string): Buffer {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error('OpenRouter image: invalid data URL in response');
  return Buffer.from(match[2], 'base64');
}

function extractImageUrlFromResponse(json: OpenRouterImageResponse): string | null {
  const message = json.choices?.[0]?.message;
  if (!message) return null;

  const fromImages = message.images?.[0]?.image_url?.url ?? message.images?.[0]?.imageUrl?.url;
  if (fromImages) return fromImages;

  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'image_url' && part.image_url?.url) {
        return part.image_url.url;
      }
    }
  }

  if (typeof content === 'string') {
    const dataMatch = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/.exec(content);
    if (dataMatch) return dataMatch[0];
  }

  return null;
}

function extractTextFromResponse(json: OpenRouterImageResponse): string {
  const message = json.choices?.[0]?.message;
  if (!message) return '';
  const content = message.content;
  if (typeof content === 'string') return content.slice(0, 400);
  if (Array.isArray(content)) {
    return content
      .filter((p) => p?.type === 'text' && p.text)
      .map((p) => p.text)
      .join(' ')
      .slice(0, 400);
  }
  return '';
}

export async function openrouterGenerateImageBuffer(
  req: OpenRouterImageRequest,
): Promise<Buffer> {
  const logger = req.logger ?? new Logger('OpenRouterImage');
  const apiUrl =
    process.env.OPENROUTER_API_URL?.trim() || 'https://openrouter.ai/api/v1/chat/completions';
  const timeoutMs = req.timeoutMs ?? (Number(process.env.OPENROUTER_IMAGE_TIMEOUT_MS) || 180_000);

  const content: OpenRouterChatMessageContentPart[] = [{ type: 'text', text: req.prompt }];
  if (req.referenceImages?.length) {
    for (const ref of req.referenceImages) {
      if (!ref.url?.trim()) continue;
      if (ref.preamble?.trim()) {
        content.push({ type: 'text', text: ref.preamble.trim() });
      }
      content.push({ type: 'image_url', image_url: { url: ref.url.trim() } });
    }
  } else {
    for (const ref of req.referenceImageUrls ?? []) {
      if (ref?.trim()) {
        content.push({ type: 'image_url', image_url: { url: ref.trim() } });
      }
    }
  }

  const body: Record<string, unknown> = {
    model: req.model,
    messages: [{ role: 'user', content }],
    modalities: req.modalities,
  };
  if (req.imageConfig && Object.keys(req.imageConfig).length > 0) {
    body.image_config = req.imageConfig;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Через прокси, а не голым fetch: с IP хостера Cloudflare отдаёт 403 «Access denied by
    // security policy», и генерация картинки падала при полностью здоровом прокси.
    const res = await openRouterFetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ult-concept-ai.local',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'ULT Concept AI',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 400);
      try {
        const err = safeJsonParse(text, 'OpenRouter image error') as { error?: { message?: string }; message?: string };
        msg = err.error?.message ?? err.message ?? msg;
      } catch {
        /* keep raw */
      }
      throw new Error(`OpenRouter image HTTP ${res.status}: ${msg}`);
    }

    const json = safeJsonParse<OpenRouterImageResponse>(text, 'OpenRouter image');
    const url = extractImageUrlFromResponse(json);
    if (!url) {
      const reply = extractTextFromResponse(json);
      const hint = reply ? ` Model reply: ${reply}` : '';
      throw new Error(`OpenRouter image: no images in response.${hint}`);
    }

    const buf = parseDataUrl(url);
    const refCount = req.referenceImages?.length ?? req.referenceImageUrls?.length ?? 0;
    logger.log(`OpenRouter image OK (${req.model}): ${buf.length} bytes, refs=${refCount}`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}
