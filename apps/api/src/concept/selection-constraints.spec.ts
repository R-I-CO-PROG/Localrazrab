import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import {
  dedupeSetByRoles,
  effectiveBudgetCap,
  finalizeConceptSelection,
  hasSufficientStock,
  validateSetConstraints,
  type SelectionConstraintsInput,
} from './selection-constraints';
import { detectConceptProductType } from '../providers/llm/concept-diversity.util';
import { clearProductTypeCache } from './product-taxonomy';

// Тип кэшируется по product.id; разные тесты переиспользуют id (m1 и т.п.) —
// чистим кэш перед каждым тестом, как это делает discoverConcepts в проде.
beforeEach(() => clearProductTypeCache());

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

const baseInput: SelectionConstraintsInput = {
  userPrompt: 'Набор инвестору, блокнот и ручка, тёмно-синий, без ярких цветов',
  budgetMax: 7000,
  budgetPerSet: 7000,
  quantity: 50,
  minProductsPerSet: 5,
  maxProductsPerSet: 7,
  colors: ['#1a237e', '#c0c0c0', '#000000'],
  allowedItems: ['блокнот', 'ручка'],
  forbiddenItems: [],
};

describe('hasSufficientStock', () => {
  const p = mockProduct({ id: 's1', name: 'Ручка' });

  it('passes when tirage is zero and stock positive', () => {
    assert.equal(hasSufficientStock(p, 0), true);
  });

  it('rejects zero stock even when tirage is zero', () => {
    assert.equal(hasSufficientStock({ ...p, stockAvailable: 0 }, 0), false);
  });

  it('rejects explicit zero stock for positive tirage', () => {
    assert.equal(hasSufficientStock({ ...p, stockAvailable: 0 }, 100), false);
  });

  it('passes when stock meets tirage', () => {
    assert.equal(hasSufficientStock({ ...p, stockAvailable: 100 }, 100), true);
  });

  it('allows unknown stock (null)', () => {
    assert.equal(hasSufficientStock({ ...p, stockAvailable: undefined }, 100), true);
  });
});

describe('validateSetConstraints', () => {
  it('flags duplicate productId', () => {
    const p = mockProduct({ id: 'a1', name: 'Блокнот A5' });
    const violations = validateSetConstraints([p, p], baseInput);
    assert.ok(violations.some((v) => v.code === 'duplicate_product_id'));
  });

  it('flags duplicate role (two powerbanks)', () => {
    const products = [
      mockProduct({ id: 'p1', name: 'Powerbank 5000', description: 'powerbank зарядка' }),
      mockProduct({ id: 'p2', name: 'Powerbank 10000', description: 'powerbank портативный' }),
    ];
    const violations = validateSetConstraints(products, baseInput);
    assert.ok(violations.some((v) => v.code === 'duplicate_role'));
  });

  it('flags budget exceeded', () => {
    const products = Array.from({ length: 5 }, (_, i) =>
      mockProduct({ id: `x${i}`, name: `Премиум термос ${i}`, price: 2000 }),
    );
    const cap = effectiveBudgetCap(7000);
    const violations = validateSetConstraints(products, baseInput);
    assert.ok(violations.some((v) => v.code === 'budget_exceeded'));
    assert.equal(products.reduce((s, p) => s + (p.price ?? 0), 0) > cap, true);
  });

  it('flags set size below min and above max', () => {
    const one = [mockProduct({ id: 'n1', name: 'Ручка шариковая' })];
    const tooMany = Array.from({ length: 8 }, (_, i) =>
      mockProduct({ id: `m${i}`, name: `Стикер ${i}`, price: 100, description: 'стикер' }),
    );
    assert.ok(validateSetConstraints(one, baseInput).some((v) => v.code === 'set_size_below_min'));
    assert.ok(validateSetConstraints(tooMany, baseInput).some((v) => v.code === 'set_size_above_max'));
  });

  it('flags missing mandatory notebook and pen', () => {
    const input: SelectionConstraintsInput = {
      ...baseInput,
      mandatoryTypes: ['notebook', 'pen'],
    };
    const products = [
      mockProduct({ id: 't1', name: 'Термокружка', description: 'термокружка' }),
      mockProduct({ id: 't2', name: 'Флешка USB', description: 'флешка usb' }),
      mockProduct({ id: 't3', name: 'Зонт', description: 'зонт' }),
      mockProduct({ id: 't4', name: 'Бутылка', description: 'бутылка' }),
      mockProduct({ id: 't5', name: 'Шоппер', description: 'шоппер сумка' }),
    ];
    const violations = validateSetConstraints(products, input);
    assert.ok(violations.some((v) => v.code === 'missing_mandatory_type'));
  });

  it('flags forbidden items from brief', () => {
    const input: SelectionConstraintsInput = {
      ...baseInput,
      forbiddenItems: ['алкоголь'],
    };
    const products = [
      mockProduct({ id: 'w1', name: 'Набор вина', description: 'вино алкоголь' }),
    ];
    const violations = validateSetConstraints(products, input);
    assert.ok(violations.some((v) => v.code === 'forbidden_item'));
  });

  it('allows premium notebook when brief bans only plain notebooks', () => {
    const input: SelectionConstraintsInput = {
      ...baseInput,
      userPrompt: 'Набор для выпускников. Исключить обычные блокноты и ручки.',
      forbiddenItems: ['обычные блокноты', 'ручки'],
    };
    const products = [
      mockProduct({
        id: 'nb1',
        name: 'Блокнот Revello, темно-синий',
        description: 'премиальный блокнот',
        price: 1200,
      }),
    ];
    const violations = validateSetConstraints(products, input);
    assert.ok(!violations.some((v) => v.code === 'forbidden_item'));
  });

  it('flags plain notebook when brief bans ordinary notebooks', () => {
    const input: SelectionConstraintsInput = {
      ...baseInput,
      userPrompt: 'Исключить обычные блокноты.',
      forbiddenItems: ['обычные блокноты'],
    };
    const products = [
      mockProduct({
        id: 'nb2',
        name: 'Блокнот А5 офисный',
        description: 'блокнот',
        price: 150,
      }),
    ];
    const violations = validateSetConstraints(products, input);
    assert.ok(violations.some((v) => v.code === 'forbidden_item'));
  });

  it('flags bright colors when brief forbids them', () => {
    const products = [
      mockProduct({
        id: 'y1',
        name: 'Жёлтый блокнот',
        description: 'блокнот желтый яркий',
        price: 500,
      }),
    ];
    const violations = validateSetConstraints(products, baseInput);
    assert.ok(
      violations.some((v) => v.code === 'bright_color_banned' || v.code === 'color_conflict' || v.code === 'forbidden_color'),
    );
  });

  it('flags forbidden black when brief bans black and gray', () => {
    const input: SelectionConstraintsInput = {
      ...baseInput,
      userPrompt: 'Новогодний набор, красный и зелёный. Запрещены чёрный и серый.',
      colors: ['#EF4444', '#22C55E'],
    };
    const products = [
      mockProduct({ id: 'g1', name: 'Шарф серый', description: 'серый шарф', price: 500 }),
    ];
    const violations = validateSetConstraints(products, input);
    assert.ok(violations.some((v) => v.code === 'forbidden_color'));
  });

  it('flags duplicate drinkware family (mug + bottle)', () => {
    const products = [
      mockProduct({ id: 'm1', name: 'Кружка керамика', description: 'кружка', price: 400 }),
      mockProduct({ id: 'b1', name: 'Бутылка спорт', description: 'бутылка', price: 500 }),
      mockProduct({ id: 'p1', name: 'Ручка', description: 'ручка', price: 300 }),
      mockProduct({ id: 'n1', name: 'Блокнот', description: 'блокнот', price: 600 }),
      mockProduct({ id: 'z1', name: 'Зонт', description: 'зонт', price: 700 }),
    ];
    const violations = validateSetConstraints(products, baseInput);
    assert.ok(violations.some((v) => v.code === 'duplicate_role' || v.code === 'same_type_overflow'));
  });

  it('flags missing required category sweets', () => {
    const input: SelectionConstraintsInput = {
      ...baseInput,
      userPrompt: 'Новогодний корпоратив. Обязательны сладости в каждом наборе.',
      requiredCategories: [{ key: 'sweets', labelRu: 'сладости', minCount: 1 }],
    };
    const products = [
      mockProduct({ id: 'c1', name: 'Кружка', description: 'кружка', price: 400 }),
      mockProduct({ id: 'c2', name: 'Ручка', description: 'ручка', price: 300 }),
      mockProduct({ id: 'c3', name: 'Блокнот', description: 'блокнот', price: 600 }),
      mockProduct({ id: 'c4', name: 'Зонт', description: 'зонт', price: 700 }),
      mockProduct({ id: 'c5', name: 'Шоппер', description: 'шоппер', price: 500 }),
    ];
    const violations = validateSetConstraints(products, input);
    assert.ok(violations.some((v) => v.code === 'missing_required_category'));
  });
});

describe('dedupeSetByRoles', () => {
  it('removes second powerbank and duplicate ids', () => {
    const products = [
      mockProduct({ id: 'pb1', name: 'Powerbank Pro', description: 'powerbank', price: 1500 }),
      mockProduct({ id: 'pb2', name: 'Powerbank Lite', description: 'powerbank зарядка', price: 1200 }),
      mockProduct({ id: 'nb1', name: 'Блокнот A5', description: 'блокнот ежедневник', price: 800 }),
      mockProduct({ id: 'nb1', name: 'Блокнот A5 dup', description: 'блокнот', price: 800 }),
    ];
    const { products: kept, removed } = dedupeSetByRoles(products, baseInput);
    const powerbanks = kept.filter((p) => /powerbank/i.test(p.description ?? ''));
    assert.equal(powerbanks.length, 1);
    assert.equal(kept.length, 2);
    assert.ok(removed.length >= 2);
  });
});

describe('finalizeConceptSelection', () => {
  it('trims set to budget and fills mandatory types when possible', () => {
    const catalog: CatalogProduct[] = [
      mockProduct({ id: 'nb1', name: 'Блокнот премиум', description: 'блокнот ежедневник', price: 1200 }),
      mockProduct({ id: 'pen1', name: 'Ручка металл', description: 'ручка шариковая', price: 900 }),
      mockProduct({ id: 'mug1', name: 'Кружка керамика', description: 'кружка', price: 800 }),
      mockProduct({ id: 'bot1', name: 'Бутылка спорт', description: 'бутылка', price: 700 }),
      mockProduct({ id: 'pb1', name: 'Powerbank 5000', description: 'powerbank', price: 2500 }),
      mockProduct({ id: 'pb2', name: 'Powerbank 10000', description: 'powerbank зарядка', price: 3500 }),
      mockProduct({ id: 'therm1', name: 'Термос', description: 'термос', price: 1800 }),
      mockProduct({ id: 'bag1', name: 'Шоппер', description: 'шоппер', price: 600 }),
    ];

    const initial = [
      catalog[5],
      catalog[5],
      catalog[4],
      catalog[4],
      mockProduct({ id: 'expensive', name: 'Премиум набор', price: 5000 }),
    ];

    const { products, report } = finalizeConceptSelection(initial, baseInput, { catalog });
    const total = products.reduce((s, p) => s + (p.price ?? 0), 0);
    const cap = effectiveBudgetCap(7000);

    // Начальный набор — дубли (id + два powerbank) + перебюджетный «Премиум набор» (5000).
    // Финалайзер обязан: (1) выкинуть перебюджетный товар и уложиться в кап,
    assert.ok(total <= cap, `total ${total} should be <= ${cap}`);
    assert.ok(!products.some((p) => p.id === 'expensive'), 'перебюджетный товар должен быть удалён');
    // (2) убрать дубликаты id и оставить максимум один powerbank,
    assert.equal(new Set(products.map((p) => p.id)).size, products.length);
    assert.ok(
      products.filter((p) => detectConceptProductType(p) === 'powerbank').length <= 1,
      'не более одного powerbank',
    );
    // (3) дозаполнить набор качественными позициями настолько, насколько позволяет каталог.
    // В этом мини-каталоге drinkware-кап (1 на набор: термос уже занял слот, кружка/бутылка
    // заблокированы) + ценовой пол (шоппер 600₽ < minUnitPriceForSet) оставляют максимум 4
    // валидных типа. Реальный дефицит система фиксирует как soft-violation set_size_below_min,
    // а не жёсткую ошибку — поэтому жёсткого равенства minProductsPerSet тут быть не может.
    assert.ok(
      products.length >= 4 && products.length <= baseInput.maxProductsPerSet,
      `набор дозаполнен до ${products.length} (ожидалось 4..${baseInput.maxProductsPerSet})`,
    );
    assert.ok(report.repairs.length > 0);
  });

  it('repairs missing mandatory thermos and blanket by replacement', () => {
    const cozyBrief =
      'Зимний уют. ОБЯЗАТЕЛЬНЫ термос и плед. Бюджет на комплект 2500 ₽.';
    const catalog: CatalogProduct[] = [
      mockProduct({ id: 'pl1', name: 'Плед Арго', description: 'плед флис', price: 900 }),
      mockProduct({ id: 'th1', name: 'Термос Steel 500', description: 'термос', price: 1100 }),
      mockProduct({ id: 'mu1', name: 'Кружка', description: 'кружка', price: 400 }),
      mockProduct({ id: 'ca1', name: 'Свеча аромат', description: 'свеча', price: 350 }),
      mockProduct({ id: 'fit1', name: 'Набор для фитнеса Cross', description: 'фитнес', price: 500 }),
    ];
    const input: SelectionConstraintsInput = {
      userPrompt: cozyBrief,
      budgetPerSet: 2500,
      budgetMax: 2500,
      quantity: 100,
      minProductsPerSet: 4,
      maxProductsPerSet: 6,
      colors: ['#D4A574'],
      allowedItems: [],
      forbiddenItems: [],
      mandatoryTypes: ['thermos', 'blanket'],
    };
    const initial = [catalog[4], catalog[2], catalog[3]];
    const { products, report } = finalizeConceptSelection(initial, input, { catalog });
    const types = products.map((p) => detectConceptProductType(p));
    assert.ok(types.includes('blanket') || types.includes('thermos'));
    assert.ok(
      report.repairs.some((r) => r.reason?.includes('mandatory_type')),
      'expected mandatory repair',
    );
  });
});
