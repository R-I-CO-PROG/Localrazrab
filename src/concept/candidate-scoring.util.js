"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreCandidateForSet = scoreCandidateForSet;
exports.compareCandidatesForSet = compareCandidatesForSet;
const catalog_brief_relevance_util_1 = require("../providers/llm/catalog-brief-relevance.util");
const catalog_color_match_util_1 = require("../providers/llm/catalog-color-match.util");
const parse_brief_util_1 = require("../requests/parse-brief.util");
const catalog_brief_relevance_util_2 = require("../providers/llm/catalog-brief-relevance.util");
const catalog_filter_util_1 = require("../providers/llm/catalog-filter.util");
const concept_product_picker_util_1 = require("../providers/llm/concept-product-picker.util");
const project_brief_profile_util_1 = require("../providers/llm/project-brief-profile.util");
const product_role_util_1 = require("./product-role.util");
const selection_constraints_1 = require("./selection-constraints");
function scoreCandidateForSet(product, ctx) {
    const penalties = [];
    const role = (0, product_role_util_1.detectProductRole)(product);
    const family = (0, product_role_util_1.roleFamilyForProduct)(product);
    let relevance = (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(product, ctx.userPrompt, ctx.brandColors);
    const forbiddenHints = (0, catalog_brief_relevance_util_2.parseBriefForbiddenColors)(ctx.userPrompt);
    if ((0, catalog_color_match_util_1.productHasForbiddenColor)(product, forbiddenHints)) {
        return {
            total: -500,
            relevance: -500,
            color: -500,
            image: 0,
            diversity: 0,
            briefFit: 0,
            penalties: ['forbidden_color'],
        };
    }
    const paletteScore = (0, catalog_color_match_util_1.scoreBriefPaletteMatch)(product, ctx.brandColors, forbiddenHints);
    let color = paletteScore !== 0 ? paletteScore : (0, catalog_color_match_util_1.scoreBrandColorMatch)(product, ctx.brandColors);
    if (ctx.brandColors.length > 0) {
        color = Math.round(color * (paletteScore > 0 ? 1.5 : 1.2));
    }
    let image = (0, selection_constraints_1.hasValidProductImage)(product) ? 40 : -120;
    let diversity = 0;
    let briefFit = 0;
    if (ctx.filterInput) {
        briefFit = (0, catalog_filter_util_1.scoreProductForBrief)(product, ctx.filterInput) * 0.35;
    }
    if (!ctx.skipThematicScoring) {
        relevance += (0, concept_product_picker_util_1.scoreProductForConcept)(product, ctx.conceptTitle ?? '', ctx.conceptComposition ?? '', ctx.userPrompt) * 0.2;
    }
    const profile = (0, project_brief_profile_util_1.extractProjectBriefProfile)({
        userPrompt: ctx.userPrompt,
        projectCategory: ctx.filterInput?.projectCategory,
        colors: ctx.brandColors,
        allowedItems: ctx.filterInput?.allowedItems,
        forbiddenItems: ctx.filterInput?.forbiddenItems,
    });
    if (profile.positioning === 'premium' && (product.price ?? 0) < 150) {
        relevance -= 35;
        penalties.push('too_cheap_for_premium');
    }
    if (profile.positioning === 'premium' && (product.price ?? 0) >= 400) {
        relevance += 20;
    }
    if (/минимализм|минималист/i.test(ctx.userPrompt) && (0, product_role_util_1.isGiftBundleProduct)(product)) {
        relevance -= 35;
        penalties.push('bundle_vs_minimalism');
    }
    if (!ctx.skipThematicScoring && /разработчик|инженер|it[\s-]|tech|инновац|конференц/i.test(ctx.userPrompt)) {
        if (role.isTech || role.isOffice)
            relevance += 30;
        if (role.role === 'home' || role.role === 'scarf' || role.role === 'towel') {
            relevance -= 80;
            penalties.push('irrelevant_for_tech_brief');
        }
        if ((0, product_role_util_1.isGiftBundleProduct)(product))
            relevance -= 45;
    }
    if (!ctx.skipThematicScoring && /новогод|рождеств|ёлоч|елоч/i.test(ctx.userPrompt)) {
        if (/разделочн|бейсболк|путешеств/i.test(product.name.toLowerCase())) {
            relevance -= 90;
            penalties.push('off_theme_new_year');
        }
    }
    if (!ctx.skipThematicScoring && /спорт|болельщик|динамичн/i.test(ctx.userPrompt)) {
        if (role.role === 'office' && role.legacyType === 'cutting_board') {
            relevance -= 100;
        }
    }
    if (!ctx.skipThematicScoring && /здоров|wellness|медицин|фарма|витамин|зож/i.test(ctx.userPrompt)) {
        if (['bottle', 'towel', 'fitness', 'stress_ball', 'thermos'].includes(role.legacyType))
            relevance += 35;
        if (role.legacyType === 'christmas_decor' || role.legacyType === 'car_accessory')
            relevance -= 90;
        if (/сладост|шоколад|конфет/i.test(product.name.toLowerCase()))
            relevance -= 60;
    }
    if (!ctx.skipThematicScoring && /молодеж|молодёж|студент|gen\s*z|зумер|креативн|creative|ярк|неон|фестивал/i.test(ctx.userPrompt)) {
        if (['tshirt', 'hoodie', 'cap', 'bucket_hat', 'sticker', 'speaker', 'sunglasses'].includes(role.legacyType)) {
            relevance += 30;
        }
        if (role.role === 'office' && ['pen', 'notebook'].includes(role.legacyType) && (product.price ?? 0) < 200) {
            relevance -= 40;
        }
        if (role.legacyType === 'socks' && !/носк/i.test(ctx.userPrompt))
            relevance -= 50;
    }
    if ((0, catalog_color_match_util_1.productConflictsBriefPalette)(product, ctx.brandColors, ctx.userPrompt, forbiddenHints)) {
        color -= 100;
        penalties.push('color_conflict');
    }
    if ((0, parse_brief_util_1.briefPrefersWarmColors)(ctx.userPrompt)) {
        const warmth = (0, catalog_color_match_util_1.scoreWarmthTone)(product, ctx.userPrompt);
        color += warmth;
        if (warmth < 0)
            penalties.push('cool_tone_vs_warm_brief');
        if (warmth > 0)
            briefFit += 15;
    }
    if (ctx.presentDisplayTypes?.has((0, selection_constraints_1.displayTypeForCap)(product))) {
        diversity -= 70;
        penalties.push(`duplicate_display_type:${(0, selection_constraints_1.displayTypeForCap)(product)}`);
    }
    if (ctx.presentFamilies?.has(family)) {
        diversity -= 90;
        penalties.push(`duplicate_family:${family}`);
    }
    if (ctx.presentRoles?.has(role.role)) {
        diversity -= 60;
        penalties.push(`duplicate_role:${role.role}`);
    }
    if ((0, product_role_util_1.isGiftBundleProduct)(product) && (ctx.bundleCount ?? 0) >= 1) {
        diversity -= 150;
        penalties.push('second_bundle');
    }
    if (role.role === 'other' && (ctx.otherCount ?? 0) >= (ctx.maxOtherRoles ?? 2)) {
        diversity -= 50;
        penalties.push('too_many_other');
    }
    const total = Math.round(relevance + color + image + diversity + briefFit);
    return { total, relevance, color, image, diversity, briefFit, penalties };
}
function compareCandidatesForSet(a, b, ctx) {
    return scoreCandidateForSet(b, ctx).total - scoreCandidateForSet(a, ctx).total;
}
//# sourceMappingURL=candidate-scoring.util.js.map