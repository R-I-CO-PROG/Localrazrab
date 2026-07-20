import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import {
  buildSetWithRelaxation,
  displayTypeForCap,
  finalizeConceptSelection,
  isDisplayCappedType,
  type SelectionConstraintsInput,
} from './selection-constraints';
import { scoreBriefPaletteMatch } from '../providers/llm/catalog-color-match.util';
import { extractRequiredCategoriesFromBrief } from '../requests/brief-required-categories.util';
import { productMatchesRequiredCategory } from '../catalog/brief-category-buckets.util';
import { clearProductTypeCache } from './product-taxonomy';

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
    stockAvailable: 200,
    colors: [],
    ...overrides,
  };
}

function buildTesterCatalog(): CatalogProduct[] {
  return [
    mockProduct({ id: 'scarf1', name: 'Шарф шерстяной', description: 'шарф зимний', price: 900, category: 'Одежда' }),
    mockProduct({ id: 'glove1', name: 'Перчатки тёплые', description: 'перчатки зимние', price: 700, category: 'Одежда' }),
    mockProduct({ id: 'mug-r', name: 'Кружка красная', description: 'кружка красная', price: 600 }),
    mockProduct({ id: 'mug-g', name: 'Кружка зелёная', description: 'кружка зеленая', price: 650 }),
    mockProduct({ id: 'candle1', name: 'Свеча аромат', description: 'свеча', price: 400 }),
    mockProduct({ id: 'pen1', name: 'Ручка металл', description: 'ручка', price: 500 }),
    mockProduct({ id: 'nb1', name: 'Блокнот A5', description: 'блокнот ежедневник', price: 800 }),
    mockProduct({ id: 'mat1', name: 'Коврик для йоги', description: 'коврик спорт фитнес', price: 1100, category: 'Отдых и спорт' }),
    mockProduct({ id: 'exp1', name: 'Эспандер', description: 'эспандер спорт', price: 450, category: 'Отдых и спорт' }),
    mockProduct({ id: 'bottle1', name: 'Бутылка спорт', description: 'бутылка для воды спорт', price: 550 }),
    mockProduct({ id: 'marker1', name: 'Набор маркеров', description: 'маркеры для рисования', price: 700, category: 'Офис и канцелярия' }),
    mockProduct({ id: 'sketch1', name: 'Скетчбук A4', description: 'скетчбук художественный', price: 850 }),
    mockProduct({ id: 'paint1', name: 'Краски акварель', description: 'краски художественные', price: 950 }),
    mockProduct({ id: 'bag1', name: 'Шоппер', description: 'шоппер сумка', price: 500 }),
    mockProduct({ id: 'pb1', name: 'Powerbank 5000', description: 'powerbank зарядка', price: 1800 }),
    mockProduct({ id: 'umb1', name: 'Зонт', description: 'зонт', price: 1200 }),
    mockProduct({ id: 'therm1', name: 'Термос', description: 'термос', price: 1500 }),
    mockProduct({ id: 'sticker1', name: 'Стикеры', description: 'стикер наклейка', price: 150 }),
  ];
}

const BRIEF_NG =
  'Новогодний корпоратив. Без ярких цветов. Обязательно включить зимние аксессуары (шарфы/перчатки). ' +
  'Красный и зелёный в палитре. 5 предметов. Бюджет 5000 руб.';
const BRIEF_SPORT =
  'Подарки для спортцентра. Обязательно включить спортивные аксессуары. 5 предметов. Бюджет 6000 руб.';
const BRIEF_ART =
  'Набор для творчества и искусства. Обязательно художественные принадлежности. 5 предметов. Бюджет 5500 руб.';

beforeEach(() => clearProductTypeCache());

describe('buildSetWithRelaxation — briefs #1/#6/#9 non-empty', () => {
  const catalog = buildTesterCatalog();

  function runBrief(brief: string, colors: string[] = []) {
    const input: SelectionConstraintsInput = {
      userPrompt: brief,
      budgetPerSet: 6000,
      budgetMax: 6000,
      quantity: 100,
      minProductsPerSet: 5,
      maxProductsPerSet: 6,
      colors,
      allowedItems: [],
      forbiddenItems: [],
      requiredCategories: extractRequiredCategoriesFromBrief(brief),
    };
    return buildSetWithRelaxation(
      {
        constraints: input,
        options: { catalog },
        initial: [],
        targetCount: 5,
      },
      catalog,
    );
  }

  it('brief #1 (NG + winter accessories) yields >=5 products', () => {
    const { products, level } = runBrief(BRIEF_NG, ['#EF4444', '#22C55E']);
    assert.ok(products.length >= 5, `expected >=5, got ${products.length} at L${level}`);
  });

  it('brief #6 (sport center) yields >=5 products with sport category when available', () => {
    const { products } = runBrief(BRIEF_SPORT);
    assert.ok(products.length >= 5);
    const hasSport = products.some((p) => productMatchesRequiredCategory(p, 'sport'));
    assert.ok(hasSport, 'expected at least one sport-category product');
  });

  it('brief #9 (art) yields >=5 products with art supplies when available', () => {
    const { products } = runBrief(BRIEF_ART);
    assert.ok(products.length >= 5);
    const hasArt = products.some((p) => productMatchesRequiredCategory(p, 'art'));
    assert.ok(hasArt, 'expected at least one art product');
  });
});

describe('DISPLAY_TYPE_CAP — no duplicate display types', () => {
  it('dedupes two mugs to one drinkware', () => {
    const catalog = buildTesterCatalog();
    const input: SelectionConstraintsInput = {
      userPrompt: 'Корпоративный набор',
      budgetPerSet: 8000,
      budgetMax: 8000,
      quantity: 50,
      minProductsPerSet: 4,
      maxProductsPerSet: 6,
      colors: [],
      allowedItems: [],
      forbiddenItems: [],
    };
    const initial = [
      catalog.find((p) => p.id === 'mug-r')!,
      catalog.find((p) => p.id === 'mug-g')!,
      catalog.find((p) => p.id === 'pen1')!,
      catalog.find((p) => p.id === 'nb1')!,
    ];
    const { products } = finalizeConceptSelection(initial, input, { catalog });
    const drinkwareCount = products.filter((p) => displayTypeForCap(p) === 'drinkware').length;
    assert.ok(drinkwareCount <= 1, `expected <=1 drinkware, got ${drinkwareCount}`);
    assert.ok(isDisplayCappedType('drinkware'));
  });
});

describe('palette quota — >=50% in gamut', () => {
  it('scores palette from product color tokens when DB hex is null', () => {
    const colors = ['красный', 'зеленый'];
    const mug = mockProduct({
      id: 'm-red',
      name: 'Кружка',
      description: 'кружка',
      colors: [{ name: 'красный' }],
    });
    assert.ok(scoreBriefPaletteMatch(mug, colors, []) > 0);
  });
});
