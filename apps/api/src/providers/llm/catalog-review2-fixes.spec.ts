import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from './catalog-brief-relevance.util';
import { detectTypeSlug, clearProductTypeCache } from '../../concept/product-taxonomy';
import { SelectionLedger } from './catalog-selection-ledger';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее', price = 500): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: name, price,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
    externalId: name, sourceId: 'oasis',
  } as CatalogProduct;
}
const rel = (name: string, brief: string) =>
  scoreBriefRelevanceWithContext(p(name), buildBriefRelevanceContext(brief, []));

// R1 — декоративный/садовый фонарь НЕ режется novelty-гейтом
describe('novelty: декоративный фонарь не зарезан (R1)', () => {
  beforeEach(() => clearProductTypeCache());
  it('садовый/декоративный/настольный фонарь в generic-брифе — не reject', () => {
    const b = 'подарки на 8 марта женщинам-коллегам';
    assert.ok(rel('Садовый фонарь на солнечной батарее', b) > -70, 'садовый');
    assert.ok(rel('Уличный декоративный фонарь', b) > -70, 'уличный');
    assert.ok(rel('Настольный фонарь-ночник', b) > -70, 'ночник');
  });
  it('тактический фонарик всё ещё режется вне контекста', () => {
    assert.ok(rel('Фонарик «Дарт», 350 Лм, черный', 'подарки врачам') <= -70);
  });
});

// R2 — настольный держатель телефона НЕ режется (только автомобильный)
describe('novelty: настольный держатель телефона не зарезан (R2)', () => {
  beforeEach(() => clearProductTypeCache());
  it('настольная подставка-держатель для смартфона в desk-tech брифе — не reject', () => {
    const b = 'настольный гаджет для офиса';
    assert.ok(rel('Настольная подставка-держатель для смартфона', b) > -70);
    assert.ok(rel('Держатель для смартфона настольный алюминиевый', b) > -70);
  });
  it('автомобильный держатель вне авто-брифа — режется', () => {
    assert.ok(rel('Автомобильный держатель для телефона "Allo"', 'подарки врачам') <= -70);
  });
});

// R3 — медицинский бриф не разрешает спорт-гаджеты; wellness — разрешает
describe('novelty: медицинский бриф ≠ фитнес (R3)', () => {
  beforeEach(() => clearProductTypeCache());
  it('врачу — коврик/шейкер зарезаны даже при health', () => {
    const b = 'подарки врачам на день медицинского работника, забота о здоровье';
    assert.ok(rel('Коврик для фитнеса и йоги', b) <= -70, 'коврик');
    assert.ok(rel('Спортивный шейкер Top Up', b) <= -70, 'шейкер');
  });
  it('ЗОЖ/wellness (не медицина) — коврик разрешён', () => {
    assert.ok(rel('Коврик для фитнеса и йоги', 'ЗОЖ-набор, здоровый образ жизни сотрудников') > -70);
  });
});

// R5/R6 — таксономия: flashlight/tool не крадут легитимные товары
describe('таксономия: слаги не крадут легитимные товары (R5/R6)', () => {
  beforeEach(() => clearProductTypeCache());
  it('«ручка с фонариком» → pen, не flashlight', () => {
    assert.equal(detectTypeSlug(p('Ручка шариковая с фонариком LED', 'Ручки')), 'pen');
  });
  it('«брелок с фонариком» / «отвёртка-брелок» → не flashlight/tool', () => {
    assert.notEqual(detectTypeSlug(p('Брелок сувенирный с фонариком LED', 'Сувениры и награды')), 'flashlight');
    assert.notEqual(detectTypeSlug(p('Отвертка-брелок сувенирная', 'Сувениры и награды')), 'tool');
  });
  it('садовый фонарь → не flashlight (декоративный)', () => {
    assert.notEqual(detectTypeSlug(p('Садовый фонарь на солнечной батарее', 'Прочее')), 'flashlight');
  });
  it('настоящий тактический фонарик → flashlight', () => {
    assert.equal(detectTypeSlug(p('Фонарик «Дарт», 350 Лм', 'Фонари')), 'flashlight');
  });
});

// R4 — ledger.release освобождает выброшенный товар, не трогая seed и общие ключи
describe('SelectionLedger.release (R4)', () => {
  it('release освобождает id/base/line выброшенного товара', () => {
    const ledger = new SelectionLedger(new Set(), new Set(), new Set(), 'набор');
    const x = p('Ручка Parker чёрная', 'Ручки');
    ledger.reserve(x);
    assert.equal(ledger.canUse(x), false, 'после reserve занят');
    ledger.release(x);
    assert.equal(ledger.canUse(x), true, 'после release снова доступен');
  });
  it('release НЕ трогает seed-ключи прошлых наборов', () => {
    const ledger = new SelectionLedger(
      new Set(['seed-id']), new Set(['line:powerbank']), new Set(['line:powerbank']), 'набор',
    );
    const otherPb = p('Пауэрбанк 5000 mAh', 'Электроника'); // делит line:powerbank с seed
    assert.equal(ledger.canUse(otherPb), false, 'seed изначально блокирует повербанк');
    const pb = p('Пауэрбанк 10000 mAh', 'Электроника');
    ledger.reserve(pb);
    ledger.release(pb); // release не должен снять seed-ключ line:powerbank
    assert.equal(ledger.canUse(otherPb), false, 'seed line-key должен остаться после release');
  });
});
