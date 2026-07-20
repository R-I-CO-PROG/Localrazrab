import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enforceSetHardConstraints,
  type SelectionConstraintsInput,
} from './selection-constraints';
import type { CatalogProduct } from '../providers/llm/catalog.util';

let seq = 0;
function mk(
  name: string,
  opts: Partial<CatalogProduct> & { color?: string } = {},
): CatalogProduct {
  const id = opts.id ?? `p${++seq}`;
  const { color, ...rest } = opts;
  return {
    id,
    name,
    category: opts.category ?? 'Прочее',
    subcategory: opts.subcategory ?? '',
    description: opts.description ?? '',
    price: opts.price ?? 800,
    stockAvailable: opts.stockAvailable ?? 5000,
    colors: color ? ([{ name: color, hex: null, code: null }] as unknown as CatalogProduct['colors']) : [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/x.jpg',
    imageUrl: 'https://cdn.example.com/x.jpg',
    ...rest,
  } as CatalogProduct;
}

function baseInput(over: Partial<SelectionConstraintsInput> = {}): SelectionConstraintsInput {
  return {
    userPrompt: 'подарочный набор коллегам',
    budgetPerSet: 6000,
    quantity: 100,
    minProductsPerSet: 3,
    maxProductsPerSet: 5,
    colors: [],
    allowedItems: [],
    forbiddenItems: [],
    ...over,
  };
}

describe('enforceSetHardConstraints — единый финальный бэкстоп ограничений', () => {
  it('чистый набор → no-op (идемпотентность)', () => {
    const set = [
      mk('Ежедневник классический', { price: 900 }),
      mk('Кружка керамическая', { price: 700 }),
      mk('Повербанк 10000 мАч', { price: 1200 }),
    ];
    const res = enforceSetHardConstraints(set, baseInput(), []);
    assert.equal(res.removed.length, 0, `removed=${res.removed.map((r) => r.code)}`);
    assert.equal(res.added.length, 0);
    assert.deepEqual(res.set.map((p) => p.id), set.map((p) => p.id));
  });

  it('forbidden item убирается и добирается из пула', () => {
    const forbidden = mk('Плед флисовый тёплый', { id: 'bad', price: 900 });
    const set = [
      mk('Ежедневник классический', { price: 900 }),
      mk('Кружка керамическая', { price: 700 }),
      forbidden,
    ];
    const pool = [mk('Флешка металлическая 32 ГБ', { id: 'good', price: 1500 })];
    const res = enforceSetHardConstraints(set, baseInput({ forbiddenItems: ['плед'] }), pool);
    assert.ok(res.removed.some((r) => r.product.id === 'bad' && r.code === 'forbidden_item'));
    assert.ok(!res.set.some((p) => p.id === 'bad'), 'запрещённый плед удалён');
    assert.ok(res.set.some((p) => p.id === 'good'), 'слот добран из пула');
    assert.equal(res.set.length, 3);
  });

  it('G1: allowedItems=«Электроника» — товар не из этого бакета удаляется и добирается замена', () => {
    const mug = mk('Кружка керамическая', { id: 'mug', price: 900, category: 'Кружки' });
    const set = [
      mk('Повербанк 10000 мАч', { price: 1200, category: 'Электроника' }),
      mug,
    ];
    const pool = [mk('Настольная лампа', { id: 'lamp', price: 1500, category: 'Электроника' })];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ allowedItems: ['Электроника'], minProductsPerSet: 2 }),
      pool,
    );
    assert.ok(res.removed.some((r) => r.product.id === 'mug' && r.code === 'not_in_allowed_bucket'));
    assert.ok(!res.set.some((p) => p.id === 'mug'));
    assert.ok(res.set.some((p) => p.id === 'lamp'), 'добрана замена из разрешённого бакета');
  });

  it('G1: явный конфликт палитры брифа («без тёмных тонов») удаляет чёрный товар (не только цвето-критичные типы)', () => {
    const dark = mk('Ежедневник классический черный', { id: 'dark', price: 900, color: 'черный' });
    const set = [
      mk('Повербанк 10000 мАч', { price: 1200 }),
      mk('Кружка керамическая', { price: 700 }),
      dark,
    ];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ userPrompt: 'без тёмных тонов, бренд синий', colors: ['синий'], minProductsPerSet: 2 }),
      [],
    );
    assert.ok(res.removed.some((r) => r.product.id === 'dark'), 'тёмный товар удалён конфликтом палитры');
    assert.ok(!res.set.some((p) => p.id === 'dark'));
  });

  it('G1: budgetMax теперь доходит до reconcile → high-budget (implicit premium) режет копеечные стикеры/брелоки', () => {
    const sticker = mk('Стикерпак брендированный', { id: 'sticker', price: 80 });
    const set = [mk('Повербанк', { price: 3000 }), mk('Ежедневник', { price: 2500 }), sticker];
    // Без явного слова «премиум» — только budgetPerSet≥6000 инферит premium (parseQualityFloor).
    const res = enforceSetHardConstraints(
      set,
      baseInput({ userPrompt: 'набор партнёрам', budgetPerSet: 8000, minProductsPerSet: 2 }),
      [],
    );
    assert.ok(res.removed.some((r) => r.product.id === 'sticker'), 'копеечный стикер удалён при высоком бюджете');
  });

  it('G1: тот же стикер НЕ удаляется при низком бюджете (premium-floor не срабатывает зря)', () => {
    const sticker = mk('Стикерпак брендированный', { id: 'sticker', price: 80 });
    const set = [mk('Повербанк', { price: 700 }), mk('Ежедневник', { price: 600 }), sticker];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ userPrompt: 'набор партнёрам', budgetPerSet: 1500, minProductsPerSet: 2 }),
      [],
    );
    assert.ok(!res.removed.some((r) => r.product.id === 'sticker'));
  });

  it('G1: земляные тона брифа — конфликт ловится ДАЖЕ когда не forbidden-цвет (новое покрытие, не дубль)', () => {
    const pink = mk('Сумка розовая элегантная', { id: 'pink', price: 900, color: 'розовый' });
    const set = [
      mk('Повербанк 10000 мАч', { price: 1200 }),
      mk('Кружка керамическая', { price: 700 }),
      pink,
    ];
    const res = enforceSetHardConstraints(
      set,
      baseInput({
        userPrompt: 'натуральная цветовая гамма, землистые тона, бренд коричневый',
        colors: ['коричневый'],
        minProductsPerSet: 2,
      }),
      [],
    );
    assert.ok(res.removed.some((r) => r.product.id === 'pink'), 'розовый удалён конфликтом земляной палитры');
  });

  it('G1: allowedItems с нераспознанной строкой (не бакет) НЕ превращает whitelist в пустой (no-op)', () => {
    const set = [mk('Кружка керамическая', { price: 900, category: 'Кружки' })];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ allowedItems: ['повербанк'], minProductsPerSet: 1 }),
      [],
    );
    assert.equal(res.removed.length, 0, 'нераспознанная строка не режет весь набор');
  });

  it('унификация: бэкстоп ловит еду/алкоголь через общий матчер (forbidden «алкоголь» → вино)', () => {
    const wine = mk('Вино красное подарочное', { id: 'wine', price: 900, category: 'Алкоголь' });
    const set = [
      mk('Ежедневник классический', { price: 900 }),
      mk('Повербанк 10000 мАч', { price: 1200 }),
      wine,
    ];
    const res = enforceSetHardConstraints(set, baseInput({ forbiddenItems: ['алкоголь'], minProductsPerSet: 2 }), []);
    assert.ok(res.removed.some((r) => r.product.id === 'wine' && r.code === 'forbidden_item'), 'вино удалено бэкстопом');
    assert.ok(!res.set.some((p) => p.id === 'wine'));
  });

  it('«без красного» → красный товар удаляется (forbidden_color)', () => {
    const red = mk('Кружка керамическая', { id: 'red', color: 'красный', price: 700 });
    const set = [
      mk('Ежедневник классический', { price: 900 }),
      mk('Повербанк 10000 мАч', { price: 1200 }),
      red,
    ];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ userPrompt: 'мерч без красного цвета', minProductsPerSet: 2 }),
      [],
    );
    assert.ok(res.removed.some((r) => r.product.id === 'red' && r.code === 'forbidden_color'));
    assert.ok(!res.set.some((p) => p.id === 'red'));
  });

  it('цвето-критичный клеш с брендом (оранжевая кружка при синем бренде) удаляется', () => {
    const orange = mk('Кружка керамическая', { id: 'orange', color: 'оранжевый', price: 700 });
    const set = [
      mk('Ежедневник классический', { price: 900 }),
      mk('Повербанк 10000 мАч', { price: 1200 }),
      orange,
    ];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ colors: ['синий'], minProductsPerSet: 2 }),
      [],
    );
    assert.ok(res.removed.some((r) => r.product.id === 'orange' && r.code === 'color_conflict'));
  });

  it('тираж: нефулфиллящий товар меняется при наличии замены', () => {
    const lowStock = mk('Кружка керамическая', { id: 'low', stockAvailable: 40, price: 700 });
    const set = [
      mk('Ежедневник классический', { price: 900 }),
      mk('Повербанк 10000 мАч', { price: 1200 }),
      lowStock,
    ];
    const pool = [mk('Термос стальной', { id: 'repl', stockAvailable: 9000, price: 1500 })];
    const res = enforceSetHardConstraints(set, baseInput({ quantity: 100 }), pool);
    assert.ok(res.removed.some((r) => r.product.id === 'low' && r.code === 'insufficient_stock'));
    assert.ok(res.set.some((p) => p.id === 'repl'));
  });

  it('тираж: нефулфиллящий товар ОСТАЁТСЯ, если замены нет (пустой слот хуже)', () => {
    const lowStock = mk('Кружка керамическая', { id: 'low', stockAvailable: 40, price: 700 });
    const set = [
      mk('Ежедневник классический', { price: 900 }),
      mk('Повербанк 10000 мАч', { price: 1200 }),
      lowStock,
    ];
    const res = enforceSetHardConstraints(set, baseInput({ quantity: 100 }), []);
    assert.ok(res.set.some((p) => p.id === 'low'), 'без замены товар с малым остатком сохранён');
  });

  it('бюджет: самая дорогая НЕ-mandatory позиция снимается при превышении лимита', () => {
    const set = [
      mk('Ежедневник классический', { price: 900 }),
      mk('Кружка керамическая', { price: 700 }),
      mk('Повербанк премиум', { id: 'expensive', price: 4000 }),
    ];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ budgetPerSet: 2000, minProductsPerSet: 2 }),
      [],
    );
    assert.ok(res.removed.some((r) => r.product.id === 'expensive' && r.code === 'budget_exceeded'));
  });

  it('mandatory low-stock якорь НЕ подменяется другим типом (только свой тип или остаётся)', () => {
    // Повербанк с малым остатком, mandatory. В пуле только кабель (совместимый комплемент, но НЕ
    // повербанк). Раньше step-2 менял якорь на кабель → тип powerbank терялся. Теперь — остаётся.
    const anchor = mk('Повербанк 10000 мАч', { id: 'pb', stockAvailable: 40, price: 1200 });
    const cable = mk('Кабель USB-C', { id: 'cable', stockAvailable: 9000, price: 1500 });
    const res = enforceSetHardConstraints(
      [anchor],
      baseInput({ quantity: 100, minProductsPerSet: 1, maxProductsPerSet: 1, mandatoryTypes: ['powerbank'] }),
      [cable],
    );
    assert.ok(res.set.some((p) => p.id === 'pb'), 'обязательный повербанк сохранён, а не заменён кабелем');
    assert.ok(!res.set.some((p) => p.id === 'cable'));
  });

  it('mandatory low-stock меняется на СВОЙ тип, если такой есть в пуле', () => {
    const anchor = mk('Повербанк 10000 мАч', { id: 'pb', stockAvailable: 40, price: 1200 });
    const betterPb = mk('Повербанк 20000 мАч', { id: 'pb2', stockAvailable: 9000, price: 1400 });
    const cable = mk('Кабель USB-C', { id: 'cable', stockAvailable: 9000, price: 1500 });
    const res = enforceSetHardConstraints(
      [anchor],
      baseInput({ quantity: 100, minProductsPerSet: 1, maxProductsPerSet: 1, mandatoryTypes: ['powerbank'] }),
      [betterPb, cable],
    );
    assert.ok(res.set.some((p) => p.id === 'pb2'), 'заменён на фулфиллящий повербанк своего типа');
  });

  it('пустой вход → пустой выход (набор из ничего не конструируется)', () => {
    const res = enforceSetHardConstraints([], baseInput(), [mk('Ежедневник', { price: 1500 })]);
    assert.equal(res.set.length, 0);
    assert.equal(res.added.length, 0);
  });

  it('вход больше max → подрезается до max (снимаются слабейшие не-mandatory)', () => {
    const set = [
      mk('Повербанк 10000 мАч', { id: 'pb', price: 1200 }),
      mk('Ежедневник классический', { id: 'd', price: 900 }),
      mk('Кружка керамическая', { id: 'm', price: 700 }),
      mk('Флешка 32 ГБ', { id: 'f', price: 800 }),
    ];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ minProductsPerSet: 2, maxProductsPerSet: 3, budgetPerSet: 20000 }),
      [],
    );
    assert.equal(res.set.length, 3, 'подрезано до max=3');
    assert.ok(res.removed.some((r) => r.code === 'set_size_above_max'));
  });

  it('accept-предикат уважается при доборе (anchor-режим)', () => {
    const forbidden = mk('Плед флисовый', { id: 'bad', price: 900 });
    const set = [mk('Повербанк 10000 мАч', { id: 'anchor', price: 1200 }), forbidden];
    const cable = mk('Кабель USB-C', { id: 'cable', price: 1500 });
    const bag = mk('Сумка-шоппер', { id: 'bag', price: 1500 });
    const res = enforceSetHardConstraints(
      set,
      baseInput({ forbiddenItems: ['плед'], minProductsPerSet: 2, maxProductsPerSet: 2 }),
      [cable, bag],
      { accept: (c) => c.id === 'cable' },
    );
    assert.ok(!res.set.some((p) => p.id === 'bad'));
    assert.ok(res.set.some((p) => p.id === 'cable'), 'добран только accept-совместимый кабель');
    assert.ok(!res.set.some((p) => p.id === 'bag'), 'сумка отклонена accept-предикатом');
  });

  it('G5: снимает структурный дубль капнутого семейства, введённый пост-гейтом (два пледа)', () => {
    // Пост-гейт (composition-opt/rerank) ввёл второй плед — капнутое семейство textile допускает 1.
    const set = [
      mk('Плед флисовый серый', { id: 'pl1', price: 900 }),
      mk('Плед вязаный бежевый', { id: 'pl2', price: 1100 }),
      mk('Кружка керамическая', { id: 'mug', price: 700 }),
    ];
    // В пуле есть НЕ-плед замена для добора после снятия дубля.
    const pool = [mk('Ежедневник классический', { id: 'nb', price: 800 })];
    const res = enforceSetHardConstraints(set, baseInput(), pool);
    const pledCount = res.set.filter((p) => /плед/i.test(p.name)).length;
    assert.equal(pledCount, 1, `дубль пледа не снят: ${res.set.map((p) => p.name)}`);
    assert.ok(res.removed.some((r) => r.code === 'duplicate_role'), `нет duplicate_role: ${res.removed.map((r) => r.code)}`);
  });

  it('скан#5: товар с явным нулевым остатком снимается даже БЕЗ тиража', () => {
    const oos = mk('Кружка керамическая', { id: 'oos', price: 700, stockAvailable: 0 });
    const set = [
      mk('Ежедневник классический', { id: 'nb', price: 900 }),
      mk('Повербанк 10000 мАч', { id: 'pb', price: 1200 }),
      oos,
    ];
    const pool = [mk('Флешка металлическая 32 ГБ', { id: 'good', price: 1500 })];
    // quantity=null → тираж-шаг не работает; раньше stock=0 доезжал до набора.
    const res = enforceSetHardConstraints(set, baseInput({ quantity: null }), pool);
    assert.ok(!res.set.some((p) => p.id === 'oos'), `stock=0 просочился: ${res.set.map((p) => p.id)}`);
    assert.ok(res.removed.some((r) => r.product.id === 'oos' && r.code === 'insufficient_stock'));
  });

  it('скан#5: stock=null (остаток неизвестен) считается доступным и НЕ снимается', () => {
    const unknown = mk('Кружка керамическая', { id: 'unk', price: 700, stockAvailable: undefined });
    const set = [
      mk('Ежедневник классический', { id: 'nb', price: 900 }),
      mk('Повербанк 10000 мАч', { id: 'pb', price: 1200 }),
      unknown,
    ];
    const res = enforceSetHardConstraints(set, baseInput({ quantity: null }), []);
    assert.ok(res.set.some((p) => p.id === 'unk'), 'stock=null должен считаться доступным');
  });

  it('скан#5: ОБЯЗАТЕЛЬНЫЙ тип с нулевым остатком остаётся (тип важнее дефицита)', () => {
    const oosMandatory = mk('Повербанк 10000 мАч', { id: 'pb0', price: 1200, stockAvailable: 0 });
    const set = [
      mk('Ежедневник классический', { id: 'nb', price: 900 }),
      mk('Кружка керамическая', { id: 'mug', price: 700 }),
      oosMandatory,
    ];
    const res = enforceSetHardConstraints(
      set,
      baseInput({ quantity: null, mandatoryTypes: ['powerbank'] }),
      [],
    );
    assert.ok(res.set.some((p) => p.id === 'pb0'), `обязательный повербанк потерян: ${res.set.map((p) => p.id)}`);
  });

  it('G5: НЕ снимает дубль, если оба обязательного типа (конфликт брифа — не тихая потеря)', () => {
    // Два пледа, ОБА обязательного типа blanket → бэкстоп их не роняет (лучше конфликт наружу).
    const set = [
      mk('Плед флисовый серый', { id: 'pl1', price: 900 }),
      mk('Плед вязаный бежевый', { id: 'pl2', price: 1100 }),
      mk('Кружка керамическая', { id: 'mug', price: 700 }),
    ];
    const res = enforceSetHardConstraints(set, baseInput({ mandatoryTypes: ['blanket'] }), []);
    const pledCount = res.set.filter((p) => /плед/i.test(p.name)).length;
    assert.equal(pledCount, 2, `обязательные пледы не должны сниматься: ${res.set.map((p) => p.name)}`);
  });
});
