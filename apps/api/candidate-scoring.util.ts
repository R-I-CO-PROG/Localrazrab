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
import { detectProductRole, isGiftBundleProduct, roleFamilyForProduct } from './product-role.util';
import { hasValidProductImage } from './selection-constraints';

export interface CandidateScoreContext {
  userPrompt: string;
  brandColors: string[];
  filterInput?: CatalogFilterInput;
  conceptTitle?: string;
  conceptComposition?: string;
  /** Типы/семейства уже в наборе */
  presentFamilies?: Set<string>;
  presentRoles?: Set<string>;
  bundleCount?: number;
  otherCount?: number;
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
  let image = hasValidProductImage(product) ? 40 : -120;
  let diversity = 0;
  let briefFit = 0;

  if (ctx.filterInput) {
    briefFit = scoreProductForBrief(product, ctx.filterInput) * 0.35;
  }

  relevance += scoreProductForConcept(
    product,
    ctx.conceptTitle ?? '',
    ctx.conceptComposition ?? '',
    ctx.userPrompt,
  ) * 0.2;

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

  if (/разработчик|инженер|it[\s-]|tech|инновац|конференц/i.test(ctx.userPrompt)) {
    if (role.isTech || role.isOffice) relevance += 30;
    if (role.role === 'home' || role.role === 'scarf' || role.role === 'towel') {
      relevance -= 80;
      penalties.push('irrelevant_for_tech_brief');
    }
    if (isGiftBundleProduct(product)) relevance -= 45;
  }

  if (/новогод|рождеств|ёлоч|елоч/i.test(ctx.userPrompt)) {
    if (/разделочн|бейсболк|путешеств/i.test(product.name.toLowerCase())) {
      relevance -= 90;
      penalties.push('off_theme_new_year');
    }
  }

  if (/спорт|болельщик|динамичн/i.test(ctx.userPrompt)) {
    if (role.role === 'office' && role.legacyType === 'cutting_board') {
      relevance -= 100;
    }
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

  if (role.role === 'other' && (ctx.otherCount ?? 0) >= 2) {
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
