import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyRerankToSet } from './catalog-set-assembler.util';
import { parseRerankJson } from '../../agents/catalog-buyer.agent';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import { estimateSetTotalPrice } from './set-budget.util';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price: number): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 500, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}
const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

describe('parseRerankJson', () => {
  it('парсит валидный ответ, режет до 2 замен, отбрасывает мусор', () => {
    const r = parseRerankJson('```json\n{"replace":[{"outId":"a","inId":"b","reason":"дубль"},{"outId":"c","inId":"d"},{"outId":"e","inId":"f"}],"coherenceNote":"ок"}\n```');
    assert.equal(r.replace.length, 2);
    assert.equal(r.replace[0].inId, 'b');
    assert.equal(r.coherenceNote, 'ок');
  });
  it('пустой/битый ответ → пустой replace', () => {
    assert.deepEqual(parseRerankJson('{"replace":[]}').replace, []);
    assert.deepEqual(parseRerankJson('{"replace":[{"outId":"x","inId":"x"}]}').replace, []); // out===in отбрасывается
  });
});

describe('applyRerankToSet: детерминированная валидация свопов', () => {
  beforeEach(() => clearProductTypeCache());

  it('валидная замена применяется, число позиций и cap сохранены', () => {
    const set = [prod('mug', 'Кружка', 'Кружки', 400), prod('flash', 'Флешка в виде футболки', 'Электроника', 500), prod('bag', 'Сумка', 'Сумки', 600)];
    const pool = [...set, prod('diary', 'Ежедневник кожаный', 'Ежедневники', 700)];
    const l = ledger(); set.forEach((p) => l.reserve(p));
    const out = applyRerankToSet({ set, pool, swaps: [{ outId: 'flash', inId: 'diary' }], ledger: l, budgetPerSet: 3000 });
    assert.equal(out.length, 3);
    assert.ok(out.some((p) => p.id === 'diary') && !out.some((p) => p.id === 'flash'));
  });

  it('замена, пробивающая cap, отклоняется', () => {
    const set = [prod('a', 'A', 'CatA', 400), prod('b', 'B', 'CatB', 400), prod('c', 'C', 'CatC', 400)];
    const pool = [...set, prod('exp', 'Дорогой', 'CatD', 5000)];
    const l = ledger(); set.forEach((p) => l.reserve(p));
    const out = applyRerankToSet({ set, pool, swaps: [{ outId: 'a', inId: 'exp' }], ledger: l, budgetPerSet: 3000 });
    assert.ok(!out.some((p) => p.id === 'exp'), 'дорогая замена пробила бы cap 3000');
    assert.ok(estimateSetTotalPrice(out) <= 3000);
  });

  it('не выкидывает mandatory-тип', () => {
    const set = [prod('pb', 'Внешний аккумулятор 5000', 'Электроника', 700), prod('mug', 'Кружка', 'Кружки', 400), prod('bag', 'Сумка', 'Сумки', 500)];
    const pool = [...set, prod('nb', 'Блокнот', 'Ежедневники', 500)];
    const l = ledger(); set.forEach((p) => l.reserve(p));
    // критик пытается выкинуть повербанк (mandatory powerbank) — должно быть отклонено
    const out = applyRerankToSet({ set, pool, swaps: [{ outId: 'pb', inId: 'nb' }], ledger: l, budgetPerSet: 3000, mandatoryTypes: ['powerbank'] });
    assert.ok(out.some((p) => p.id === 'pb'), 'mandatory повербанк не должен выкидываться');
  });

  it('замена на заблокированное семейство отклоняется', () => {
    const set = [prod('mug', 'Кружка', 'Кружки', 400), prod('nb', 'Блокнот', 'Ежедневники', 400), prod('bag', 'Сумка', 'Сумки', 500)];
    const pool = [...set, prod('t', 'Футболка Premium', 'Одежда', 600)];
    const l = ledger(); set.forEach((p) => l.reserve(p));
    const out = applyRerankToSet({ set, pool, swaps: [{ outId: 'mug', inId: 't' }], ledger: l, budgetPerSet: 3000, blockedFamilies: new Set(['unique:tshirt']) });
    assert.ok(!out.some((p) => p.id === 't'), 'заблокированное семейство не воскрешать');
  });

  it('inId вне пула / уже в наборе — тихо игнорируется', () => {
    const set = [prod('a', 'A', 'CatA', 400), prod('b', 'B', 'CatB', 400), prod('c', 'C', 'CatC', 400)];
    const l = ledger(); set.forEach((p) => l.reserve(p));
    const out = applyRerankToSet({ set, pool: set, swaps: [{ outId: 'a', inId: 'ghost' }, { outId: 'b', inId: 'c' }], ledger: l, budgetPerSet: 3000 });
    assert.deepEqual(out.map((p) => p.id), ['a', 'b', 'c']);
  });
});
