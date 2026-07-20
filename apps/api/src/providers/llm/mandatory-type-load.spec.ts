import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  missingMandatoryTypes,
  mandatoryTypeSearchTerm,
  mergeMandatoryTypeCandidates,
  reserveMandatoryCandidates,
} from './mandatory-type-load.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price: number, stock = 100): CatalogProduct {
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

describe('missingMandatoryTypes', () => {
  beforeEach(() => clearProductTypeCache());

  it('срез без проектора при брифе «добавь проектор» → [projector]', () => {
    const candidates = [
      prod('mug1', 'Кружка керамическая', 'Кружки', 400),
      prod('pb1', 'Внешний аккумулятор Cypher 10000 Mah', 'Электроника', 1300),
    ];
    assert.deepEqual(
      missingMandatoryTypes(candidates, 'добавь проектор, собери набор tech'),
      ['projector'],
    );
  });

  it('проектор уже в срезе → пусто', () => {
    const candidates = [
      prod('proj1', 'Проектор Rombica Ray Mini Black', 'Электроника', 3255),
    ];
    assert.deepEqual(
      missingMandatoryTypes(candidates, 'добавь проектор, собери набор tech'),
      [],
    );
  });

  it('бриф без обязательных типов → пусто', () => {
    assert.deepEqual(missingMandatoryTypes([], 'подарки для команды'), []);
  });
});

describe('mandatoryTypeSearchTerm', () => {
  it('projector → «проектор» (labelRu таксономии)', () => {
    assert.equal(mandatoryTypeSearchTerm('projector'), 'проектор');
  });
});

describe('mergeMandatoryTypeCandidates', () => {
  beforeEach(() => clearProductTypeCache());

  it('вливает только нужный тип, лучшие по остатку первыми, без дублей и блэклиста', () => {
    const candidates = [prod('mug1', 'Кружка керамическая', 'Кружки', 400)];
    const loaded = [
      prod('lamp1', 'Интерьерная лампа обычная', 'Лампы', 9974, 4),
      prod('proj-mini', 'Проектор Rombica Ray Mini Black', 'Электроника', 3255, 6),
      prod('proj-nano', 'Проектор Rombica Multiverse Nano Q', 'Электроника', 7840, 445),
      prod('proj-black', 'Проектор Rombica Blacklisted', 'Электроника', 5000, 999),
      prod('mug1', 'Кружка керамическая', 'Кружки', 400),
    ];
    const out = mergeMandatoryTypeCandidates(candidates, loaded, 'projector', ['proj-black']);
    const added = out.slice(1).map((p) => p.id);
    assert.deepEqual(added, ['proj-nano', 'proj-mini']);
  });

  it('нет подходящих → кандидаты без изменений', () => {
    const candidates = [prod('mug1', 'Кружка керамическая', 'Кружки', 400)];
    const out = mergeMandatoryTypeCandidates(candidates, [], 'projector');
    assert.equal(out, candidates);
  });
});

describe('reserveMandatoryCandidates', () => {
  beforeEach(() => clearProductTypeCache());

  it('обязательный тип отсутствует в filtered — доливается из baseCatalog', () => {
    const filtered = [prod('mug1', 'Кружка керамическая', 'Кружки', 400)];
    const base = [
      ...filtered,
      prod('proj-nano', 'Проектор Rombica Multiverse Nano Q', 'Электроника', 7840, 445),
      prod('proj-mini', 'Проектор Rombica Ray Mini Black', 'Электроника', 3255, 6),
    ];
    const out = reserveMandatoryCandidates(filtered, base, 'добавь проектор, собери набор', [], 8);
    assert.ok(out.some((p) => /проектор/i.test(p.name)), 'проектор должен быть зарезервирован');
  });

  it('уже достаточно представлен — не дублируем сверх perType', () => {
    const filtered = [
      prod('p1', 'Проектор A', 'Электроника', 3000, 500),
      prod('p2', 'Проектор B', 'Электроника', 3000, 500),
    ];
    const base = [
      ...filtered,
      prod('p3', 'Проектор C', 'Электроника', 3000, 500),
    ];
    const out = reserveMandatoryCandidates(filtered, base, 'нужен проектор', [], 2);
    assert.equal(out.length, 2, 'при perType=2 и 2 уже присутствующих — не добавляем');
  });

  it('бриф без обязательных типов → без изменений', () => {
    const filtered = [prod('mug1', 'Кружка', 'Кружки', 400)];
    assert.equal(reserveMandatoryCandidates(filtered, filtered, 'подарки команде'), filtered);
  });

  it('уважает блэклист', () => {
    const filtered = [prod('mug1', 'Кружка', 'Кружки', 400)];
    const base = [...filtered, prod('proj-bad', 'Проектор Blacklisted', 'Электроника', 3000, 500)];
    const out = reserveMandatoryCandidates(filtered, base, 'нужен проектор', ['proj-bad'], 8);
    assert.ok(!out.some((p) => p.id === 'proj-bad'), 'блэклист-товар не резервируется');
  });
});
