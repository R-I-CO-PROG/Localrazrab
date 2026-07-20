import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalogByBriefBuckets } from './brief-category-buckets.util';
import {
  briefIsApparelFocused,
  reconcileBriefConstraints,
} from '../requests/brief-constraints.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';

function p(name: string, category: string): CatalogProduct {
  return {
    id: name, name, category, subcategory: '', description: '', price: 900,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('G1: clothing-бриф больше не схлопывает пул в «Текстиль»/одну категорию', () => {
  it('briefIsApparelFocused: явная одежда — да; широкий «мерч» / кружки / полотенца — нет', () => {
    assert.equal(briefIsApparelFocused('футболки сотрудникам'), true);
    assert.equal(briefIsApparelFocused('брендированные худи и свитшоты'), true);
    assert.equal(briefIsApparelFocused('корпоративный мерч'), false);
    assert.equal(briefIsApparelFocused('брендированные кружки и ручки'), false);
    assert.equal(briefIsApparelFocused('нужны полотенца оранжевые'), false); // «поло» не триггерит
  });

  it('reconcile: широкий «мерч» НЕ добавляет whitelist-бакет (пул не схлопывается)', () => {
    const r = reconcileBriefConstraints('корпоративный мерч для сотрудников', [], []);
    assert.ok(!r.allowedItems.includes('Текстиль'), 'нет ошибочного Текстиль');
    assert.ok(!r.allowedItems.includes('Одежда'), 'широкий мерч не whitelist-ит Одежду');
  });

  it('reconcile: явная одежда → whitelist «Одежда» (не «Текстиль»)', () => {
    const r = reconcileBriefConstraints('футболки и худи сотрудникам', [], []);
    assert.ok(r.allowedItems.includes('Одежда'));
    assert.ok(!r.allowedItems.includes('Текстиль'));
  });
});

describe('G1: filterCatalogByBriefBuckets — forbidden ЖЁСТКО, relax только allowed (не до сырого)', () => {
  const mug = p('Кружка керамическая', 'Кружки');
  const wine = p('Вино красное сухое', 'Алкоголь');
  const elec = p('Повербанк 10000 мАч', 'Электроника');

  it('пустой allowed-whitelist НЕ возвращает сырой каталог с запрещённым (вино остаётся вырезанным)', () => {
    const res = filterCatalogByBriefBuckets([mug, wine], ['Электроника'], ['Алкоголь']);
    assert.ok(!res.some((x) => x.id === wine.id), 'запрещённое вино не вернулось');
    assert.deepEqual(res.map((x) => x.id), [mug.id]); // откат whitelist до forbidden-clean, не до raw
  });

  it('allowed матчит → возвращает whitelisted, forbidden всё равно вырезан', () => {
    const res = filterCatalogByBriefBuckets([mug, wine, elec], ['Электроника'], ['Алкоголь']);
    assert.deepEqual(res.map((x) => x.id), [elec.id]);
  });

  it('только forbidden (без allowed) → forbidden-clean', () => {
    const res = filterCatalogByBriefBuckets([mug, wine], [], ['Алкоголь']);
    assert.deepEqual(res.map((x) => x.id), [mug.id]);
  });
});
