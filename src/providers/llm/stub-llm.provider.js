"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubLlmProvider = void 0;
const common_1 = require("@nestjs/common");
const catalog_util_1 = require("./catalog.util");
const parse_desired_count_1 = require("./parse-desired-count");
const respect_user_products_1 = require("./respect-user-products");
let StubLlmProvider = class StubLlmProvider {
    async generate(input) {
        const catalog = input.catalogProducts ?? [];
        const count = input.desiredItemCount ?? (0, parse_desired_count_1.defaultItemCount)(input.userPrompt);
        const respectUser = (0, respect_user_products_1.shouldRespectUserProducts)(input);
        const items = respectUser || input.sceneOnly
            ? input.productNames
            : catalog.length > 0
                ? (0, catalog_util_1.stubPickProductsFromBrief)(catalog, input.userPrompt, input.category, count).map((p) => p.name)
                : input.productNames;
        const colorHint = input.colors.length > 0
            ? `brand palette ${input.colors.join(' and ')}`
            : 'dark corporate neutrals';
        const briefHint = input.userPrompt.trim().slice(0, 120);
        const themeHint = `${input.category}${input.quantity ? ` for ${input.quantity} units` : ''}`;
        return {
            items,
            composition: `Концепция «${input.category}»: ${items.join(', ')}${input.quantity ? ` · тираж ${input.quantity} шт.` : ''}. ${briefHint || 'Корпоративный набор под бренд.'}`,
            style: briefHint.toLowerCase().includes('премиум') || briefHint.toLowerCase().includes('premium')
                ? 'Премиальный каталожный'
                : briefHint.toLowerCase().includes('скейт') ||
                    briefHint.toLowerCase().includes('скеит') ||
                    briefHint.toLowerCase().includes('skater') ||
                    briefHint.toLowerCase().includes('street')
                    ? 'Скейт / streetwear'
                    : briefHint.toLowerCase().includes('минимал') || briefHint.toLowerCase().includes('tech')
                        ? 'Минималистичный tech'
                        : 'Современный корпоративный',
            image_prompt: [
                'Ultra photorealistic branded merchandise studio photography, 8k.',
                `Exactly ${items.length} item(s), no extras: ${items.join(', ')}.`,
                `${themeHint}. Dominant ${colorHint} — tinted studio lighting, subtle color wash on background and product accents.`,
                'Thematic product arrangement matching brief mood, not a random generic lineup.',
                'Realistic materials, soft directional light with brand-colored rim light, natural shadows.',
                input.hasLogo
                    ? 'Client logo as realistic print or engraving on each item surface.'
                    : 'Clean merchandise surfaces ready for branding.',
                briefHint ? `Creative direction: ${briefHint}.` : '',
                'No people, no hands, no watermark.',
            ]
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 450),
            negative_prompt: 'blurry, missing items, extra objects, wrong count, text overlay, watermark, people, hands, distorted logo, low quality, cartoon',
        };
    }
};
exports.StubLlmProvider = StubLlmProvider;
exports.StubLlmProvider = StubLlmProvider = __decorate([
    (0, common_1.Injectable)()
], StubLlmProvider);
//# sourceMappingURL=stub-llm.provider.js.map