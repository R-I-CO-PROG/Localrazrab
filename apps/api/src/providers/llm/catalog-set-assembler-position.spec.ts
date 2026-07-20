import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function prod(
  id: string,
  name: string,
  category: string,
  price: number,
  color?: string,
): CatalogProduct {
  return {
    id,
    name,
    category,
    subcategory: null,
    description: name,
    price,
    stockAvailable: 500,
    colors: color ? [{ name: color }] : [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

describe('assembleFromPool: атрибуты и цвет именованной позиции из брифа', () => {
  beforeEach(() => clearProductTypeCache());

  it('коррекция обязательного типа: чёрный 10000 → синий 5000 по брифу', () => {
    const mug = prod('mug', 'Кружка керамическая', 'Посуда', 400);
    const pbBlack = prod('pb-black-10k', 'Пауэрбанк Alpha 10000 mAh', 'Электроника', 900, 'черный');
    const pbBlue = prod('pb-blue-5k', 'Пауэрбанк Beta 5000 mAh', 'Гаджеты', 900, 'синий');
    const pool = [mug, pbBlack, pbBlue];

    const out = assembleFromPool({
      pool,
      productIds: ['mug', 'pb-black-10k'],
      ledger: ledger(),
      minItems: 2,
      maxItems: 2,
      budgetPerSet: null,
      brief: 'нужен пауэрбанк на 5000 мАч, синий, и кружка',
      brandColors: [],
      fullCatalog: pool,
      mandatoryTypes: ['powerbank'],
    });

    const ids = out.map((p) => p.id);
    assert.ok(ids.includes('pb-blue-5k'), `ожидали pb-blue-5k, получили: ${ids}`);
    assert.ok(!ids.includes('pb-black-10k'), `pb-black-10k должен быть заменён: ${ids}`);
  });

  it('коррекция по атрибуту при совпадающем цвете: 10000 синий → 5000 синий', () => {
    const mug = prod('mug', 'Кружка керамическая', 'Посуда', 400);
    const pb10 = prod('pb-blue-10k', 'Пауэрбанк Alpha 10000 mAh', 'Электроника', 900, 'синий');
    const pb5 = prod('pb-blue-5k', 'Пауэрбанк Beta 5000 mAh', 'Гаджеты', 900, 'синий');
    const pool = [mug, pb10, pb5];

    const out = assembleFromPool({
      pool,
      productIds: ['mug', 'pb-blue-10k'],
      ledger: ledger(),
      minItems: 2,
      maxItems: 2,
      budgetPerSet: null,
      brief: 'нужен пауэрбанк на 5000 мАч, синий, и кружка',
      brandColors: [],
      fullCatalog: pool,
      mandatoryTypes: ['powerbank'],
    });

    const ids = out.map((p) => p.id);
    assert.ok(ids.includes('pb-blue-5k'), `ожидали pb-blue-5k, получили: ${ids}`);
  });

  it('вставка обязательного типа выбирает вариант по атрибутам и цвету позиции', () => {
    const mug = prod('mug', 'Кружка керамическая', 'Посуда', 400);
    const pen = prod('pen', 'Ручка металлическая', 'Канцелярия', 200);
    const pbBlack = prod('pb-black-5k', 'Пауэрбанк Alpha 5000 mAh', 'Электроника', 900, 'черный');
    const pbBlue = prod('pb-blue-5k', 'Пауэрбанк Beta 5000 mAh', 'Гаджеты', 950, 'синий');
    const pool = [mug, pen, pbBlack, pbBlue];

    const out = assembleFromPool({
      pool,
      productIds: ['mug', 'pen'],
      ledger: ledger(),
      minItems: 2,
      maxItems: 3,
      budgetPerSet: null,
      brief: 'В набор нужны: кружка, ручка, пауэрбанк на 5000 мАч, синий',
      brandColors: [],
      fullCatalog: pool,
      mandatoryTypes: ['powerbank'],
    });

    const ids = out.map((p) => p.id);
    assert.ok(ids.includes('pb-blue-5k'), `ожидали синий 5000: ${ids}`);
  });

  it('своп mandatory-SKU на сток-покрывающий: байер взял флагман со стоком 1 при тираже 155', () => {
    const mug = prod('mug', 'Кружка керамическая', 'Посуда', 400);
    const projFlagship = prod('proj-flagship', 'Проектор Rombica Ray Smart Cube', 'Электроника', 16435, 'черный');
    projFlagship.stockAvailable = 1;
    const projNano = prod('proj-nano', 'Проектор Rombica Multiverse Nano Q', 'Гаджеты', 7840, 'черный');
    projNano.stockAvailable = 445;
    const pool = [mug, projFlagship, projNano];

    const out = assembleFromPool({
      pool,
      productIds: ['mug', 'proj-flagship'],
      ledger: ledger(),
      minItems: 2,
      maxItems: 2,
      budgetPerSet: null,
      brief: 'добавь проектор, собери набор tech',
      brandColors: [],
      fullCatalog: pool,
      mandatoryTypes: ['projector'],
      tirage: 155,
    });

    const ids = out.map((p) => p.id);
    assert.ok(ids.includes('proj-nano'), `ожидали сток-покрывающий proj-nano: ${ids}`);
    assert.ok(!ids.includes('proj-flagship'), `флагман со стоком 1 должен быть заменён: ${ids}`);
  });

  it('своп на сток-покрывающий работает и при маленьком бюджете (mandatory > cap)', () => {
    const mug = prod('mug', 'Кружка керамическая', 'Посуда', 400);
    const projFlagship = prod('proj-flagship', 'Проектор Rombica Ray Smart Cube', 'Электроника', 16435, 'черный');
    projFlagship.stockAvailable = 1;
    const projNano = prod('proj-nano', 'Проектор Rombica Multiverse Nano Q', 'Гаджеты', 7840, 'черный');
    projNano.stockAvailable = 445;
    const pool = [mug, projFlagship, projNano];

    const out = assembleFromPool({
      pool,
      productIds: ['mug', 'proj-flagship'],
      ledger: ledger(),
      minItems: 2,
      maxItems: 2,
      budgetPerSet: 2000,
      brief: 'добавь проектор, собери набор tech',
      brandColors: [],
      fullCatalog: pool,
      mandatoryTypes: ['projector'],
      tirage: 155,
    });

    const ids = out.map((p) => p.id);
    assert.ok(ids.includes('proj-nano'), `ожидали proj-nano при бюджете 2000: ${ids}`);
  });

  it('без спецификации позиции поведение прежнее (бренд-цвет решает)', () => {
    const mug = prod('mug', 'Кружка керамическая', 'Посуда', 400);
    const pbBlack = prod('pb-black', 'Пауэрбанк Alpha', 'Электроника', 900, 'черный');
    const pbYellow = prod('pb-yellow', 'Пауэрбанк Beta', 'Гаджеты', 900, 'желтый');
    const pool = [mug, pbBlack, pbYellow];

    const out = assembleFromPool({
      pool,
      productIds: ['mug', 'pb-black'],
      ledger: ledger(),
      minItems: 2,
      maxItems: 2,
      budgetPerSet: null,
      brief: 'нужен повербанк и кружка',
      brandColors: ['жёлтый'],
      fullCatalog: pool,
      mandatoryTypes: ['powerbank'],
    });

    const ids = out.map((p) => p.id);
    assert.ok(ids.includes('pb-yellow'), `бренд-цвет должен победить: ${ids}`);
  });
});
