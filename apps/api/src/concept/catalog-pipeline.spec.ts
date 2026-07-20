import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import { normalizeRequestColors } from '../requests/request-colors.util';
import { generateLocalCatalogIdeas } from '../providers/llm/catalog-local-ideator.util';
import { ensureConceptProducts } from '../providers/llm/concept-product-picker.util';
import { ConceptDiversityTracker } from '../providers/llm/concept-diversity.util';
import { resolveSetBudgetRange, resolveBudgetPerSet, assertBudgetPerSetInRange } from '../providers/llm/set-budget.util';
import { findProductsByBriefKeywords } from '../providers/llm/brief-keyword-search.util';
import { productVariantKey } from '../providers/llm/catalog-variant.util';
import { upgradeSetToTargetBudget } from '../providers/llm/concept-product-picker.util';
import {
  productFieldColorsMatchPalette,
  productHasForbiddenColor,
} from '../providers/llm/catalog-color-match.util';
import { typeConflictsInSet } from '../providers/llm/concept-diversity.util';
import { productViolatesMaterialBan } from '../requests/brief-constraints.util';
import { resolveProductCountBounds } from '../providers/llm/product-count-bounds.util';
import { FORBIDDEN_TONE_BRIGHT } from '../requests/brief-color-palette.util';

function mockProduct(
  overrides: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'name'>,
): CatalogProduct {
  return {
    category: 'Подарки',
    subcategory: null,
    description: overrides.description ?? null,
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/product.jpg',
    price: 1000,
    stockAvailable: 100,
    colors: [],
    ...overrides,
  };
}

describe('catalog pipeline fixes', () => {
  it('normalizeRequestColors maps Russian color names to hex', () => {
    const hex = normalizeRequestColors(['зеленый', 'голубой']);
    assert.ok(hex.some((h) => h.toLowerCase().includes('22c55e') || h.toLowerCase().includes('c55e')));
    assert.ok(hex.some((h) => h.toLowerCase().includes('06b6d4') || h.toLowerCase().includes('b6d4')));
    assert.equal(hex.length >= 2, true);
  });

  it('generateLocalCatalogIdeas returns non-empty ideas without LLM', () => {
    const ideas = generateLocalCatalogIdeas({
      userPrompt: 'Эко-набор для сотрудников, без пластика',
      category: 'Корпоративные подарки',
      desiredItemCount: 5,
      mandatoryTypes: ['bottle'],
    });
    assert.ok(ideas.length >= 5);
    for (const idea of ideas) {
      assert.ok(idea.title.length > 0);
      assert.ok((idea.productSlots ?? []).length >= 3);
    }
  });

  it('ensureConceptProducts fills to minProductsPerSet', () => {
    const catalog: CatalogProduct[] = [
      mockProduct({ id: 'm1', name: 'Термокружка стальная', description: 'термокружка', price: 1500 }),
      mockProduct({ id: 'n1', name: 'Блокнот A5', description: 'блокнот ежедневник', price: 800 }),
      mockProduct({ id: 'p1', name: 'Ручка металлическая', description: 'ручка шариковая', price: 400 }),
      mockProduct({ id: 'b1', name: 'Бутылка стеклянная', description: 'бутылка для воды', price: 1200 }),
      mockProduct({ id: 's1', name: 'Шоппер хлопок', description: 'шоппер сумка', price: 600 }),
      mockProduct({ id: 'f1', name: 'Флешка USB 16GB', description: 'флешка usb', price: 900 }),
    ];
    const tracker = new ConceptDiversityTracker(new Set());
    const filled = ensureConceptProducts(
      [catalog[0]],
      catalog,
      4,
      { title: 'Офисный набор', composition: 'блокнот ручка', brief: 'офисный набор сотрудникам' },
      new Set(),
      new Set(),
      tracker,
      42,
      false,
    );
    assert.equal(filled.length, 4);
  });

  it('resolveBudgetPerSet uses budgetMax for per-set brief', () => {
    assert.equal(resolveBudgetPerSet(6000, 8000), 8000);
    assert.equal(resolveBudgetPerSet(1500, 2500), 2500);
  });

  it('resolveBudgetPerSet does not treat total campaign budget as per-set cap', () => {
    assert.equal(resolveBudgetPerSet(6000, 1_000_000), 6000);
  });

  it('findProductsByBriefKeywords respects blockedVariants', () => {
    const catalog: CatalogProduct[] = [
      mockProduct({ id: 'nb1', name: 'Блокнот Prime', description: 'блокнот' }),
      mockProduct({ id: 'nb2', name: 'Блокнот Prime, синий', description: 'блокнот' }),
      mockProduct({ id: 'pen1', name: 'Ручка металл', description: 'ручка' }),
    ];
    const blockedVariants = new Set([productVariantKey(catalog[0])]);
    const found = findProductsByBriefKeywords(
      ['блокнот', 'ручка'],
      catalog,
      new Set(),
      blockedVariants,
    );
    assert.ok(!found.some((p) => p.id === 'nb1'));
    assert.ok(!found.some((p) => p.id === 'nb2'));
  });

  it('resolveSetBudgetRange uses budgetMin as floor', () => {
    const { floor, cap } = resolveSetBudgetRange(6000, 8000);
    assert.equal(floor, 6000);
    assert.equal(cap, 8000);
  });

  it('upgradeSetToTargetBudget pulls set total toward budgetMin', () => {
    const catalog: CatalogProduct[] = [
      mockProduct({ id: 'c1', name: 'Ручка простая', description: 'ручка', price: 150 }),
      mockProduct({ id: 'c2', name: 'Ручка премиум металл', description: 'ручка', price: 2500 }),
      mockProduct({ id: 'n1', name: 'Блокнот простой', description: 'блокнот', price: 200 }),
      mockProduct({ id: 'n2', name: 'Блокнот кожа', description: 'блокнот ежедневник', price: 3500 }),
      mockProduct({ id: 't1', name: 'Термос базовый', description: 'термос', price: 300 }),
      mockProduct({ id: 't2', name: 'Термос премиум', description: 'термос', price: 4000 }),
      mockProduct({ id: 'b1', name: 'Бутылка простая', description: 'бутылка', price: 250 }),
      mockProduct({ id: 'b2', name: 'Бутылка стекло премиум', description: 'бутылка', price: 2800 }),
    ];
    const start = [catalog[0], catalog[2], catalog[4], catalog[6]];
    const upgraded = upgradeSetToTargetBudget(
      start,
      catalog,
      8000,
      { title: 'VIP', composition: '', brief: 'премиум набор', budgetMin: 6000, budgetMax: 8000 },
    );
    const total = upgraded.reduce((s, p) => s + (p.price ?? 0), 0);
    assert.ok(total >= 6000, `expected total >= 6000, got ${total}`);
    assert.ok(total <= 8000, `expected total <= 8000, got ${total}`);
  });

  it('productFieldColorsMatchPalette matches product.colors to request palette', () => {
    const product = mockProduct({
      id: 'g1',
      name: 'Кепка',
      colors: [{ name: 'зеленый' }],
    });
    assert.equal(productFieldColorsMatchPalette(product, ['зеленый']), true);
    assert.equal(productFieldColorsMatchPalette(product, ['красный']), false);
  });

  it('typeConflictsInSet blocks duplicate drinkware and headwear families', () => {
    const types = new Set<string>();
    assert.equal(typeConflictsInSet(types, 'mug'), false);
    types.add('mug');
    assert.equal(typeConflictsInSet(types, 'bottle'), true);
    types.clear();
    types.add('cap');
    assert.equal(typeConflictsInSet(types, 'bucket_hat'), true);
    types.clear();
    types.add('shopper');
    assert.equal(typeConflictsInSet(types, 'backpack'), true);
  });

  it('productViolatesMaterialBan blocks explicit plastic, not unspecified materials', () => {
    const plastic = mockProduct({ id: 'pl1', name: 'Ручка пластиковая', description: 'пластик pp' });
    const steel = mockProduct({ id: 'st1', name: 'Термос стальной', description: 'нержавеющая сталь' });
    assert.equal(productViolatesMaterialBan(plastic.name, plastic.description ?? '', plastic.category, ['plastic']), true);
    assert.equal(productViolatesMaterialBan(steel.name, steel.description ?? '', steel.category, ['plastic']), false);
  });

  it('resolveProductCountBounds prefers request min/max over text', () => {
    const bounds = resolveProductCountBounds({
      userPrompt: 'набор из 2 предметов',
      minProductsPerSet: 4,
      maxProductsPerSet: 6,
      useProductCountLimit: true,
    });
    assert.equal(bounds.min, 4);
    assert.equal(bounds.max, 6);
  });

  it('productHasForbiddenColor detects bright tones when brief forbids them', () => {
    const neon = mockProduct({ id: 'n1', name: 'Футболка неоновая', description: 'яркий неон' });
    assert.equal(productHasForbiddenColor(neon, [FORBIDDEN_TONE_BRIGHT]), true);
  });
});
