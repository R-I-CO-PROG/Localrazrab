"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCatalogConceptsJson = parseCatalogConceptsJson;
exports.parseLlmBriefJson = parseLlmBriefJson;
exports.buildLlmOutputFromContent = buildLlmOutputFromContent;
exports.parseLlmJson = parseLlmJson;
function extractJsonObject(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced)
        return fenced[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start)
        return text.slice(start, end + 1);
    return text.trim();
}
function parseCatalogConceptsJson(content) {
    const jsonText = extractJsonObject(content.trim());
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed.concepts) || parsed.concepts.length === 0) {
        throw new Error('LLM response missing concepts array');
    }
    return { concepts: parsed.concepts };
}
function parseLlmBriefJson(content) {
    const jsonText = extractJsonObject(content.trim());
    return JSON.parse(jsonText);
}
function buildLlmOutputFromContent(content, input) {
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
        const parsed = JSON.parse(jsonText);
        if (parsed.suggestions?.length) {
            const names = parsed.suggestions.map((s) => s.name).filter(Boolean);
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
        const reasons = parsed.reasons ??
            (parsed.reason ? items.map((_, i) => (i === 0 ? parsed.reason : '')) : []);
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
    }
    else if (input.sceneOnly && input.productNames.length > 0) {
        output.items = [...input.productNames];
    }
    return output;
}
function parseLlmJson(content) {
    const jsonText = extractJsonObject(content.trim());
    const parsed = JSON.parse(jsonText);
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
//# sourceMappingURL=parse-llm-json.js.map