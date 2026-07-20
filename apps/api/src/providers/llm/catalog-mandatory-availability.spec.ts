import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalogForRequest } from './catalog-filter.util';
import { buildConceptPool } from './catalog-shortlist.util';
import { assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import { detectConceptProductType } from './concept-diversity.util';
import type { CatalogProduct } from './catalog.util';
import type { ShortlistContext } from './catalog-neural-selector.types';

/**
 * Репро бага тестера: бриф просит проектор, проекторы есть в каталоге (Rombica),
 * но у них маленькие остатки (0–6 шт при тираже 100) и высокая цена (7840 ₽ при
 * бюджете набора 5000) — stock-гейт и бюджет-гейт вырезали их ДО сборщика,
 * и обязательный тип молча пропадал из набора.
 */

function prod(
  id: string,
  name: string,
  category: string,
  price: number,
  stock: number,
): CatalogProduct {
  return {
    id,
    name,
    category,
    subcategory: null,
    description: name,
    price,
    stockAvailable: stock,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

/** Каталог по мотивам прода: проекторы с малым остатком + массовые филлеры. */
function catalogLikeProd(): CatalogProduct[] {
  const fillers: CatalogProduct[] = [];
  for (let i = 0; i < 30; i++) {
    fillers.push(prod(`mug${i}`, `Кружка керамическая М${i}`, 'Кружки', 400 + i, 5000));
    fillers.push(prod(`pen${i}`, `Ручка металлическая Р${i}`, 'Ручки', 200 + i, 8000));
    fillers.push(prod(`nb${i}`, `Блокнот А5 Б${i}`, 'Ежедневники и блокноты', 500 + i, 3000));
  }
  return [
    prod('proj-nano', 'Проектор Rombica Multiverse Nano Q', 'Электроника', 7840, 445),
    prod('proj-mini', 'Проектор Rombica Ray Mini Black', 'Электроника', 3255, 6),
    prod('proj-cube', 'Проектор Rombica Ray Smart Cube', 'Электроника', 16435, 1),
    ...fillers,
  ];
}

const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

describe('mandatory-тип переживает stock-гейт пайплайна', () => {
  beforeEach(() => clearProductTypeCache());

  it('тираж 100: проекторы с остатком < тиража остаются в filtered', () => {
    const out = filterCatalogForRequest(catalogLikeProd(), {
      userPrompt: 'Нужен набор с проектором для команды',
      quantity: 100,
      budgetMin: null,
      budgetMax: 5000,
      colors: [],
      allowedItems: [],
      forbiddenItems: [],
    });
    const projectors = out.filter((p) => detectConceptProductType(p) === 'projector');
    assert.ok(
      projectors.length > 0,
      `проекторы вырезаны stock-гейтом: ${out.length} товаров без проекторов`,
    );
  });

  it('тираж 1000 (больше любого остатка проекторов): всё равно остаются', () => {
    const out = filterCatalogForRequest(catalogLikeProd(), {
      userPrompt: 'Нужен набор с проектором',
      quantity: 1000,
      budgetMin: null,
      budgetMax: 20000,
      colors: [],
      allowedItems: [],
      forbiddenItems: [],
    });
    const projectors = out.filter((p) => detectConceptProductType(p) === 'projector');
    assert.ok(projectors.length > 0, 'проекторы вырезаны при тираже выше любого остатка');
  });
});

describe('mandatory-тип попадает в пул байера при цене выше бюджета набора', () => {
  beforeEach(() => clearProductTypeCache());

  it('бюджет 5000, единственный проектор за 7840 — всё равно в пуле', () => {
    // Пул из уже отфильтрованного каталога, где выжил только дорогой проектор.
    const catalog = [
      prod('proj-nano', 'Проектор Rombica Multiverse Nano Q', 'Электроника', 7840, 445),
      ...catalogLikeProd().filter((p) => detectConceptProductType(p) !== 'projector'),
    ];
    const ctx: ShortlistContext = {
      brief: 'Нужен набор с проектором',
      brandColors: [],
      budgetPerSet: 5000,
      mandatoryTypes: ['projector'],
    };
    const pool = buildConceptPool(catalog, catalog, ctx, ledger(), { size: 48 });
    assert.ok(
      pool.some((p) => detectConceptProductType(p) === 'projector'),
      `в пуле ${pool.length} товаров, проектора нет`,
    );
  });

  it('при тираже первым в пуле идёт mandatory-SKU с остатком ≥ тиража', () => {
    const catalog = [
      prod('proj-flagship', 'Проектор Rombica Ray Smart Cube', 'Электроника', 16435, 1),
      prod('proj-nano', 'Проектор Rombica Multiverse Nano Q', 'Электроника', 7840, 445),
      ...catalogLikeProd().filter((p) => detectConceptProductType(p) !== 'projector'),
    ];
    const ctx: ShortlistContext = {
      brief: 'Нужен набор с проектором',
      brandColors: [],
      budgetPerSet: 2000,
      mandatoryTypes: ['projector'],
      tirage: 155,
    };
    const pool = buildConceptPool(catalog, catalog, ctx, ledger(), { size: 48 });
    const projectorsInPool = pool.filter((p) => detectConceptProductType(p) === 'projector');
    assert.ok(projectorsInPool.length >= 2, `проекторов в пуле: ${projectorsInPool.length}`);
    assert.equal(
      projectorsInPool[0]?.id,
      'proj-nano',
      `первым должен идти SKU со стоком ≥ тиража, получили ${projectorsInPool[0]?.id}`,
    );
  });
});

describe('mandatory-тип попадает в КАЖДЫЙ набор при общем реестре (бренд-line-key не блокирует)', () => {
  beforeEach(() => clearProductTypeCache());

  it('5 наборов, все проекторы Rombica (line-key «rombica») — проектор в каждом', () => {
    // На проде все проекторы — Rombica; line-key 'rombica' после первого набора
    // блокировал БРЕНД целиком, и остальные 4 набора оставались без проектора.
    const projectors = [
      prod('p1', 'Проектор Rombica Multiverse Nano Q', 'Электроника', 7840, 445),
      prod('p2', 'Проектор Rombica Ray Mini Black', 'Электроника', 3255, 6),
      prod('p3', 'Мультимедийный проектор Rombica Ray Eclipse Black', 'Электроника', 11190, 1),
      prod('p4', 'Проектор Rombica Ray Smart Cube', 'Электроника', 16435, 1),
      prod('p5', 'Мультимедийный проектор Rombica Ray Light', 'Электроника', 6625, 0),
    ];
    const fillers: CatalogProduct[] = [];
    for (let i = 0; i < 30; i++) {
      fillers.push(prod(`mug${i}`, `Кружка керамическая М${i}`, 'Кружки', 400 + i, 5000));
      fillers.push(prod(`nb${i}`, `Блокнот Craft Б${i}`, 'Ежедневники и блокноты', 500 + i, 5000));
      fillers.push(prod(`bag${i}`, `Сумка городская С${i}`, 'Сумки и рюкзаки', 450 + i, 5000));
    }
    const sharedLedger = ledger();
    sharedLedger.setMandatoryTypes(['projector']);
    const pool = [...projectors, ...fillers];
    let setsWithProjector = 0;
    const firstSetProjectors: string[] = [];
    for (let c = 0; c < 5; c++) {
      const out = assembleFromPool({
        pool,
        productIds: null,
        ledger: sharedLedger,
        minItems: 3,
        maxItems: 5,
        budgetPerSet: 2000,
        brief: 'добавь проектор, собери набор tech',
        brandColors: [],
        fullCatalog: pool,
        mandatoryTypes: ['projector'],
        tirage: 155,
      });
      const proj = out.filter((p) => detectConceptProductType(p) === 'projector');
      if (proj.length) setsWithProjector++;
      if (c === 0) firstSetProjectors.push(...proj.map((p) => p.id));
    }
    assert.equal(setsWithProjector, 5, `проектор только в ${setsWithProjector} из 5 наборов`);
    // Покрытие тиража: при тираже 155 первым уходит единственный SKU со стоком ≥ 155.
    assert.deepEqual(firstSetProjectors, ['p1'], `первый набор взял ${firstSetProjectors}`);
  });
});

describe('сборщик находит mandatory-тип в fullCatalog, если pool/relaxed пусты по типу', () => {
  beforeEach(() => clearProductTypeCache());

  it('проектор только в fullCatalog и дороже cap — всё равно вставлен', () => {
    const fillers = catalogLikeProd().filter(
      (p) => detectConceptProductType(p) !== 'projector',
    );
    const pool = fillers.slice(0, 10);
    const fullCatalog = [
      prod('proj-nano', 'Проектор Rombica Multiverse Nano Q', 'Электроника', 7840, 445),
      ...fillers,
    ];
    const out = assembleFromPool({
      pool,
      productIds: null,
      ledger: ledger(),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 5000,
      brief: 'Нужен набор с проектором',
      brandColors: [],
      fullCatalog,
      mandatoryTypes: ['projector'],
    });
    assert.ok(
      out.some((p) => detectConceptProductType(p) === 'projector'),
      `в наборе нет проектора: ${out.map((p) => p.name).join(', ')}`,
    );
  });
});
