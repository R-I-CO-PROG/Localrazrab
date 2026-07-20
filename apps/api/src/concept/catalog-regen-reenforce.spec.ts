import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogConceptService } from '../agents/catalog-concept.service';
import { clearProductTypeCache } from './product-taxonomy';
import type { SelectionConstraintsInput } from './selection-constraints';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import type { Concept } from '../agents/contracts';

function prod(id: string, name: string, category: string, price: number, stock = 500): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: stock, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}

function conceptOf(products: CatalogProduct[]): Concept {
  return {
    title: 'Набор', narrative: '', description: '', items: [], styleTags: [], colorPalette: [], whyItFits: '',
    productIds: products.map((p) => p.id),
    catalogProducts: products.map((p) => ({
      id: p.id, name: p.name, category: p.category, price: p.price,
      stockAvailable: p.stockAvailable, colors: [], catalogImageUrl: p.catalogImageUrl ?? undefined,
    })),
  } as unknown as Concept;
}

function makeService(): CatalogConceptService {
  const cfg = { get: (_k: string, fb?: string) => fb ?? 'true' };
  return new CatalogConceptService(
    {} as never, {} as never, cfg as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
  );
}

function baseInput(over: Partial<SelectionConstraintsInput> = {}): SelectionConstraintsInput {
  return {
    userPrompt: 'подарочный набор коллегам',
    budgetPerSet: 6000, quantity: null,
    minProductsPerSet: 2, maxProductsPerSet: 5,
    colors: [], allowedItems: [], forbiddenItems: [],
    ...over,
  } as SelectionConstraintsInput;
}

/** Вызов приватного метода — он и есть замыкание инварианта после regen-мутаций. */
function reEnforce(
  svc: CatalogConceptService,
  concepts: Concept[],
  input: SelectionConstraintsInput,
  pool: CatalogProduct[],
  byId: Map<string, CatalogProduct>,
): Concept[] {
  return (svc as unknown as {
    reEnforceConceptsAfterRegen(c: Concept[], i: SelectionConstraintsInput, p: CatalogProduct[], b: Map<string, CatalogProduct>): Concept[];
  }).reEnforceConceptsAfterRegen(concepts, input, pool, byId);
}

describe('скан#14: regen-мутации замыкаются единым бэкстопом', () => {
  beforeEach(() => clearProductTypeCache());

  it('снимает forbidden-товар, внесённый regen-заменой, и добирает из пула', () => {
    const svc = makeService();
    const bad = prod('bad', 'Плед флисовый тёплый', 'Пледы', 900);
    const nb = prod('nb', 'Ежедневник классический', 'Ежедневники и блокноты', 900);
    const replacement = prod('good', 'Флешка металлическая 32 ГБ', 'Электроника', 1200);
    const byId = new Map([bad, nb, replacement].map((p) => [p.id, p]));
    const out = reEnforce(svc, [conceptOf([nb, bad])], baseInput({ forbiddenItems: ['плед'] }), [replacement], byId);
    const ids = (out[0].catalogProducts ?? []).map((p) => p.id);
    assert.ok(!ids.includes('bad'), `запрещённый плед пережил regen: ${ids}`);
    assert.deepEqual(out[0].productIds, ids, 'productIds рассинхронизированы с catalogProducts');
  });

  it('снимает товар с нулевым остатком, внесённый regen-добором', () => {
    const svc = makeService();
    const oos = prod('oos', 'Кружка керамическая', 'Кружки', 700, 0);
    const nb = prod('nb', 'Ежедневник классический', 'Ежедневники и блокноты', 900);
    const pen = prod('pen', 'Ручка металлическая', 'Ручки', 400);
    const byId = new Map([oos, nb, pen].map((p) => [p.id, p]));
    const out = reEnforce(svc, [conceptOf([nb, oos])], baseInput(), [pen], byId);
    const ids = (out[0].catalogProducts ?? []).map((p) => p.id);
    assert.ok(!ids.includes('oos'), `stock=0 пережил regen: ${ids}`);
  });

  it('чистый набор проходит без изменений (идемпотентность, ссылка на тот же объект)', () => {
    const svc = makeService();
    const nb = prod('nb', 'Ежедневник классический', 'Ежедневники и блокноты', 900);
    const mug = prod('mug', 'Кружка керамическая', 'Кружки', 700);
    const byId = new Map([nb, mug].map((p) => [p.id, p]));
    const input = [conceptOf([nb, mug])];
    const out = reEnforce(svc, input, baseInput(), [], byId);
    assert.equal(out[0], input[0], 'чистый набор не должен пересобираться');
  });

  it('ревью-P1: названная позиция из allowedItems НЕ снимается бэкстопом под бюджет', () => {
    const svc = makeService();
    // Повербанк дорогой: шаг 4 (бюджет) снимает самую дорогую НЕ-обязательную позицию.
    // Если mandatoryTypes не знает про названный «повербанк», он вылетит.
    const pb = prod('pb', 'Внешний повербанк 10000 мАч', 'Электроника', 4000);
    const nb = prod('nb', 'Ежедневник классический', 'Ежедневники и блокноты', 900);
    const mug = prod('mug', 'Кружка керамическая', 'Кружки', 800);
    const byId = new Map([pb, nb, mug].map((p) => [p.id, p]));
    const input = baseInput({
      budgetPerSet: 2000, // сумма 5700 > cap → шаг 4 будет снимать дорогое
      minProductsPerSet: 1,
      mandatoryTypes: ['powerbank'], // как их теперь строит selectionConstraintsFromFilterInput/селектор
    });
    const out = reEnforce(svc, [conceptOf([nb, mug, pb])], input, [], byId);
    const ids = (out[0].catalogProducts ?? []).map((p) => p.id);
    assert.ok(ids.includes('pb'), `названный повербанк снят под бюджет: ${ids}`);
  });

  it('не втаскивает в добор SKU, уже занятый ДРУГИМ набором (кросс-концептовый дедуп)', () => {
    const svc = makeService();
    const bad = prod('bad', 'Плед флисовый тёплый', 'Пледы', 900);
    const nb1 = prod('nb1', 'Ежедневник классический', 'Ежедневники и блокноты', 900);
    const nb2 = prod('nb2', 'Ежедневник премиум', 'Ежедневники и блокноты', 950);
    const shared = prod('shared', 'Флешка металлическая 32 ГБ', 'Электроника', 1200);
    const byId = new Map([bad, nb1, nb2, shared].map((p) => [p.id, p]));
    // Набор №2 УЖЕ содержит `shared`; набор №1 после снятия пледа не должен добрать тот же SKU.
    const concepts = [conceptOf([nb1, bad]), conceptOf([nb2, shared])];
    const out = reEnforce(svc, concepts, baseInput({ forbiddenItems: ['плед'] }), [shared], byId);
    const ids1 = (out[0].catalogProducts ?? []).map((p) => p.id);
    const ids2 = (out[1].catalogProducts ?? []).map((p) => p.id);
    assert.ok(!ids1.includes('bad'), 'плед не снят');
    assert.equal(
      ids1.filter((i) => i === 'shared').length + ids2.filter((i) => i === 'shared').length,
      1,
      `SKU продублирован между наборами: ${ids1} / ${ids2}`,
    );
  });
});
