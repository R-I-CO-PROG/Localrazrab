import type { CatalogProduct } from '../providers/llm/catalog.util';
import { scoreBriefRelevance } from '../providers/llm/catalog-brief-relevance.util';
import {
  productConflictsBriefPalette,
  scoreBrandColorMatch,
  scoreWarmthTone,
  scoreBriefPaletteMatch,
  productHasForbiddenColor,
} from '../providers/llm/catalog-color-match.util';
import { briefPrefersWarmColors } from '../requests/parse-brief.util';
import { parseBriefForbiddenColors } from '../providers/llm/catalog-brief-relevance.util';
import { scoreProductForBrief, type CatalogFilterInput } from '../providers/llm/catalog-filter.util';
import { scoreProductForConcept } from '../providers/llm/concept-product-picker.util';
import { extractProjectBriefProfile } from '../providers/llm/project-brief-profile.util';
import { detectProductRole, isCorporateSetFiller, isGiftBundleProduct, roleFamilyForProduct } from './product-role.util';
import { hasValidProductImage, displayTypeForCap } from './selection-constraints';

export interface CandidateScoreContext {
  userPrompt: string;
  brandColors: string[];
  filterInput?: CatalogFilterInput;
  conceptTitle?: string;
  conceptComposition?: string;
  /** Типы/семейства уже в наборе */
  presentFamilies?: Set<string>;
  presentRoles?: Set<string>;
  presentDisplayTypes?: Set<string>;
  bundleCount?: number;
  otherCount?: number;
  maxOtherRoles?: number;
  skipThematicScoring?: boolean;
}

export interface CandidateScoreBreakdown {
  total: number;
  relevance: number;
  color: number;
  image: number;
  diversity: number;
  briefFit: number;
  penalties: string[];
}

export function scoreCandidateForSet(
  product: CatalogProduct,
  ctx: CandidateScoreContext,
): CandidateScoreBreakdown {
  const penalties: string[] = [];
  const role = detectProductRole(product);
  const family = roleFamilyForProduct(product);

  if (isCorporateSetFiller(product, ctx.userPrompt)) {
    return {
      total: -400,
      relevance: -400,
      color: 0,
      image: 0,
      diversity: 0,
      briefFit: 0,
      penalties: ['packaging_filler'],
    };
  }

  let relevance = scoreBriefRelevance(product, ctx.userPrompt, ctx.brandColors);
  const forbiddenHints = parseBriefForbiddenColors(ctx.userPrompt);
  if (productHasForbiddenColor(product, forbiddenHints)) {
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

  const paletteScore = scoreBriefPaletteMatch(product, ctx.brandColors, forbiddenHints);
  let color = paletteScore !== 0 ? paletteScore : scoreBrandColorMatch(product, ctx.brandColors);
  if (ctx.brandColors.length > 0) {
    color = Math.round(color * (paletteScore > 0 ? 1.5 : 1.2));
  }
  let image = hasValidProductImage(product) ? 40 : -120;
  let diversity = 0;
  let briefFit = 0;

  if (ctx.filterInput) {
    briefFit = scoreProductForBrief(product, ctx.filterInput) * 0.35;
  }

  if (!ctx.skipThematicScoring) {
    relevance += scoreProductForConcept(
      product,
      ctx.conceptTitle ?? '',
      ctx.conceptComposition ?? '',
      ctx.userPrompt,
    ) * 0.2;
  }

  const profile = extractProjectBriefProfile({
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

  if (/минимализм|минималист/i.test(ctx.userPrompt) && isGiftBundleProduct(product)) {
    relevance -= 35;
    penalties.push('bundle_vs_minimalism');
  }

  if (!ctx.skipThematicScoring && /разработчик|инженер|it[\s-]|tech|инновац|конференц|хакатон|hackathon|кодер|coder|геймдев/i.test(ctx.userPrompt)) {
    if (role.isTech || role.isOffice) relevance += 30;
    if (role.role === 'home' || role.role === 'scarf' || role.role === 'towel' || role.role === 'packaging') {
      relevance -= 80;
      penalties.push('irrelevant_for_tech_brief');
    }
    if (isGiftBundleProduct(product)) relevance -= 45;
  }

  if (ctx.filterInput?.budgetPerSet && ctx.filterInput.budgetPerSet > 0) {
    const slots = Math.max(ctx.filterInput.minProductsPerSet ?? 3, 3);
    const perSlot = ctx.filterInput.budgetPerSet / slots;
    const price = product.price ?? 0;
    if (price > 0 && price >= perSlot * 0.45 && price <= perSlot * 1.5) briefFit += 14;
    if (price > 0 && price < perSlot * 0.12) {
      relevance -= 30;
      penalties.push('too_cheap_for_budget');
    }
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
    if (['bottle', 'towel', 'fitness', 'stress_ball', 'thermos'].includes(role.legacyType)) relevance += 35;
    if (role.legacyType === 'christmas_decor' || role.legacyType === 'car_accessory') relevance -= 90;
    if (/сладост|шоколад|конфет/i.test(product.name.toLowerCase())) relevance -= 60;
  }

  if (!ctx.skipThematicScoring && /молодеж|молодёж|студент|gen\s*z|зумер|креативн|creative|ярк|неон|фестивал/i.test(ctx.userPrompt)) {
    if (['tshirt', 'hoodie', 'cap', 'bucket_hat', 'sticker', 'speaker', 'sunglasses'].includes(role.legacyType)) {
      relevance += 30;
    }
    if (role.role === 'office' && ['pen', 'notebook'].includes(role.legacyType) && (product.price ?? 0) < 200) {
      relevance -= 40;
    }
    if (role.legacyType === 'socks' && !/носк/i.test(ctx.userPrompt)) relevance -= 50;
  }

  if (productConflictsBriefPalette(product, ctx.brandColors, ctx.userPrompt, forbiddenHints)) {
    color -= 100;
    penalties.push('color_conflict');
  }

  if (briefPrefersWarmColors(ctx.userPrompt)) {
    const warmth = scoreWarmthTone(product, ctx.userPrompt);
    color += warmth;
    if (warmth < 0) penalties.push('cool_tone_vs_warm_brief');
    if (warmth > 0) briefFit += 15;
  }

  if (ctx.presentDisplayTypes?.has(displayTypeForCap(product))) {
    diversity -= 70;
    penalties.push(`duplicate_display_type:${displayTypeForCap(product)}`);
  }

  if (ctx.presentFamilies?.has(family)) {
    diversity -= 90;
    penalties.push(`duplicate_family:${family}`);
  }

  if (ctx.presentRoles?.has(role.role)) {
    diversity -= 60;
    penalties.push(`duplicate_role:${role.role}`);
  }

  if (isGiftBundleProduct(product) && (ctx.bundleCount ?? 0) >= 1) {
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

export function compareCandidatesForSet(
  a: CatalogProduct,
  b: CatalogProduct,
  ctx: CandidateScoreContext,
): number {
  return scoreCandidateForSet(b, ctx).total - scoreCandidateForSet(a, ctx).total;
}
