"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCatalogProduct = normalizeCatalogProduct;
exports.normalizedMetaForLlm = normalizedMetaForLlm;
const concept_diversity_util_1 = require("./concept-diversity.util");
function normalizeText(text) {
    return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}
function colorLabels(product) {
    return (product.colors ?? [])
        .map((c) => (typeof c === 'string' ? c : c.name ?? ''))
        .filter(Boolean);
}
function inferPriceTier(price) {
    if (price == null || price <= 0)
        return 'unknown';
    if (price < 400)
        return 'budget';
    if (price < 1500)
        return 'mid';
    return 'premium';
}
const TYPE_USE_CASES = {
    mug: ['office', 'welcome', 'daily'],
    bottle: ['outdoor', 'sport', 'office'],
    tshirt: ['event', 'team', 'festival'],
    hoodie: ['team', 'winter', 'casual'],
    bag: ['conference', 'shopping', 'commute'],
    backpack: ['commute', 'travel', 'student'],
    pen: ['office', 'conference', 'signing'],
    notebook: ['office', 'conference', 'study'],
    powerbank: ['travel', 'conference', 'tech'],
    usb: ['conference', 'office', 'tech'],
    sunglasses: ['summer', 'outdoor', 'festival', 'lifestyle'],
    umbrella: ['rain', 'city', 'gift'],
    premium_box: ['vip', 'partner', 'onboarding'],
    christmas_decor: ['new_year', 'winter', 'gift'],
};
const TYPE_TAGS = {
    sunglasses: ['аксессуар', 'лето', 'outdoor', 'lifestyle', 'fashion'],
    powerbank: ['электроника', 'tech', 'полезность'],
    mug: ['посуда', 'офис', 'daily'],
    tshirt: ['одежда', 'wearable', 'мерч'],
};
function normalizeCatalogProduct(product) {
    const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
    const name = normalizeText(product.name);
    const desc = normalizeText(product.description ?? '');
    const categoryPath = normalizeText(product.subcategory ?? product.category ?? '');
    const text = `${name} ${desc} ${categoryPath}`;
    const rawCategory = String(product.subcategory ?? product.category ?? '');
    const isWearable = /футболк|худи|кепк|панам|одежд|wear/i.test(text) || ['tshirt', 'hoodie', 'cap'].includes(type);
    const isOffice = /офис|ежедневник|ручк|блокнот|кружк/i.test(text) || ['pen', 'notebook', 'mug'].includes(type);
    const isOutdoor = /outdoor|летн|спорт|термос|бутыл|зонт|очк/i.test(text) || ['bottle', 'umbrella', 'sunglasses'].includes(type);
    const isTech = /powerbank|заряд|usb|флеш|электрон|tech/i.test(text) || ['powerbank', 'usb'].includes(type);
    const isGiftable = /подар|набор|премиум|vip|бокс/i.test(text) || type === 'premium_box';
    const seasonality = [];
    if (/летн|ярк|неон|фестивал/i.test(text))
        seasonality.push('summer');
    if (/зимн|новогод|тепл/i.test(text))
        seasonality.push('winter');
    const styleTags = [];
    if (/премиум|vip|люкс/i.test(text))
        styleTags.push('premium');
    if (/эко|eco|бамбук|переработ/i.test(text))
        styleTags.push('eco');
    if (/спорт|active/i.test(text))
        styleTags.push('sport');
    const audienceFit = [];
    if (isOffice)
        audienceFit.push('office', 'employees');
    if (isTech)
        audienceFit.push('it', 'tech');
    if (isGiftable)
        audienceFit.push('clients', 'partners');
    return {
        rawCategory,
        normalizedProductType: type,
        semanticTags: [...(TYPE_TAGS[type] ?? []), type],
        useCases: TYPE_USE_CASES[type] ?? ['general'],
        audienceFit,
        seasonality,
        styleTags,
        colors: colorLabels(product),
        priceTier: inferPriceTier(product.price),
        isGiftable,
        isWearable,
        isOffice,
        isOutdoor,
        isTech,
    };
}
function normalizedMetaForLlm(product) {
    const meta = normalizeCatalogProduct(product);
    return {
        id: product.id,
        name: product.name,
        rawCategory: meta.rawCategory,
        normalizedProductType: meta.normalizedProductType,
        semanticTags: meta.semanticTags,
        useCases: meta.useCases,
        priceTier: meta.priceTier,
        colors: meta.colors,
        price: product.price,
        stockAvailable: product.stockAvailable,
    };
}
//# sourceMappingURL=product-normalization.util.js.map