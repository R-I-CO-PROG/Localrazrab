"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openrouterGenerateImageBuffer = openrouterGenerateImageBuffer;
const common_1 = require("@nestjs/common");
function parseDataUrl(dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
    if (!match)
        throw new Error('OpenRouter image: invalid data URL in response');
    return Buffer.from(match[2], 'base64');
}
function extractImageUrlFromResponse(json) {
    const message = json.choices?.[0]?.message;
    if (!message)
        return null;
    const fromImages = message.images?.[0]?.image_url?.url ?? message.images?.[0]?.imageUrl?.url;
    if (fromImages)
        return fromImages;
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
        if (dataMatch)
            return dataMatch[0];
    }
    return null;
}
function extractTextFromResponse(json) {
    const message = json.choices?.[0]?.message;
    if (!message)
        return '';
    const content = message.content;
    if (typeof content === 'string')
        return content.slice(0, 400);
    if (Array.isArray(content)) {
        return content
            .filter((p) => p?.type === 'text' && p.text)
            .map((p) => p.text)
            .join(' ')
            .slice(0, 400);
    }
    return '';
}
async function openrouterGenerateImageBuffer(req) {
    const logger = req.logger ?? new common_1.Logger('OpenRouterImage');
    const apiUrl = process.env.OPENROUTER_API_URL?.trim() || 'https://openrouter.ai/api/v1/chat/completions';
    const timeoutMs = req.timeoutMs ?? (Number(process.env.OPENROUTER_IMAGE_TIMEOUT_MS) || 180_000);
    const content = [{ type: 'text', text: req.prompt }];
    if (req.referenceImages?.length) {
        for (const ref of req.referenceImages) {
            if (!ref.url?.trim())
                continue;
            if (ref.preamble?.trim()) {
                content.push({ type: 'text', text: ref.preamble.trim() });
            }
            content.push({ type: 'image_url', image_url: { url: ref.url.trim() } });
        }
    }
    else {
        for (const ref of req.referenceImageUrls ?? []) {
            if (ref?.trim()) {
                content.push({ type: 'image_url', image_url: { url: ref.trim() } });
            }
        }
    }
    const body = {
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
        const res = await fetch(apiUrl, {
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
                const err = JSON.parse(text);
                msg = err.error?.message ?? err.message ?? msg;
            }
            catch {
            }
            throw new Error(`OpenRouter image HTTP ${res.status}: ${msg}`);
        }
        const json = JSON.parse(text);
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
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=openrouter-image.client.js.map