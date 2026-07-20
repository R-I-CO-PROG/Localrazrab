import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache, familyForType } from '../../concept/product-taxonomy';
import { detectConceptProductType } from './concept-diversity.util';
import { computeBlockedFamilies } from '../../agents/catalog-neural-selector.service';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price = 500): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 500, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  };
}
const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

describe('#3 жёсткий variety-cap', () => {
  beforeEach(() => clearProductTypeCache());

  it('семейство на лимите жёстко не наполняется, если есть альтернативы', () => {
    const tshirtFam = familyForType(detectConceptProductType(prod('t', 'Футболка мужская', 'Одежда')));
    const pool = [
      prod('mug', 'Кружка керамическая', 'Кружки', 400),
      prod('nb', 'Блокнот А5', 'Ежедневники и блокноты', 400),
      prod('tshirt', 'Футболка Premium мужская', 'Одежда', 450),
      prod('bag', 'Сумка городская', 'Сумки и рюкзаки', 500),
      prod('bottle', 'Бутылка для воды', 'Термосы и бутылки', 400),
    ];
    const out = assembleFromPool({
      pool,
      productIds: ['mug', 'nb'],
      ledger: ledger(),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 3000,
      brief: 'подарки команде',
      brandColors: [],
      fullCatalog: pool,
      blockedFamilies: new Set([tshirtFam]),
    });
    assert.ok(!out.some((p) => p.id === 'tshirt'), `футболка на лимите протащена: ${out.map((p) => p.id)}`);
  });

  it('фолбэк: заблокированное семейство допускается, если иначе не добрать min', () => {
    const tshirtFam = familyForType(detectConceptProductType(prod('t', 'Футболка', 'Одежда')));
    // Один не-блокированный (кружка) + футболка (blocked); min=2 → фолбэк добирает футболку.
    const pool = [
      prod('mug', 'Кружка керамическая', 'Кружки', 400),
      prod('tshirt', 'Футболка Premium', 'Одежда', 450),
    ];
    const out = assembleFromPool({
      pool,
      productIds: [],
      ledger: ledger(),
      minItems: 2,
      maxItems: 5,
      budgetPerSet: 3000,
      brief: 'подарки команде',
      brandColors: [],
      fullCatalog: pool,
      blockedFamilies: new Set([tshirtFam]),
    });
    assert.ok(out.length >= 2, `фолбэк к min не сработал: ${out.map((p) => p.id)}`);
    assert.ok(out.some((p) => p.id === 'tshirt'), 'футболка должна войти по фолбэку');
  });

  it('computeBlockedFamilies: обычная крупная группа на лимите блокируется, catch-all — нет', () => {
    // computeBlockedFamilies теперь принимает УЖЕ крупную (coarse) карту "в скольких наборах
    // встречалась группа" — по одному инкременту за концепцию, не сумму мелких семейств.
    const usage = new Map<string, number>([
      ['paper', 3],          // блокнот/ежедневник в 3 наборах → блок
      ['unique:other', 3],   // catch-all свалка → НЕ блок
      ['other', 4],          // catch-all → НЕ блок
      ['drink', 1],          // ниже лимита → НЕ блок
    ]);
    const blocked = computeBlockedFamilies(usage, []);
    assert.ok(blocked.has('paper'), 'paper на лимите должен блокироваться');
    assert.ok(!blocked.has('unique:other'), 'unique:other (catch-all) блокировать нельзя');
    assert.ok(!blocked.has('other'), 'other (catch-all) блокировать нельзя');
    assert.ok(!blocked.has('drink'), 'ниже лимита — не блок');
  });

  it('computeBlockedFamilies: обязательный тип освобождён от лимита', () => {
    const usage = new Map<string, number>([['write', 5]]);
    assert.ok(!computeBlockedFamilies(usage, ['pen']).has('write'), 'mandatory pen (write) не блокируется');
    assert.ok(computeBlockedFamilies(usage, []).has('write'), 'без mandatory — write блокируется');
  });

  it('computeBlockedFamilies: НЕ считает набор с 2 мелкими семействами одной крупной группы дважды', () => {
    // Регрессия: раньше computeBlockedFamilies суммировал fine-family usage (наушники=2,
    // колонка=1 → 'tech' получал 3 и блокировался после 2 концепций вместо 3). Теперь
    // coarseFamilyUsage строится в absorbConceptIntoRunState по одному инкременту за концепцию —
    // здесь просто проверяем контракт: 2 набора с 'tech' (даже если оба содержали и наушники,
    // и колонку) НЕ должны достигать лимита 3.
    const coarseUsageAfterTwoConcepts = new Map<string, number>([['tech', 2]]);
    assert.ok(
      !computeBlockedFamilies(coarseUsageAfterTwoConcepts, []).has('tech'),
      'tech в 2 из 5 наборов не должен блокироваться (лимит 3)',
    );
    const coarseUsageAfterThreeConcepts = new Map<string, number>([['tech', 3]]);
    assert.ok(
      computeBlockedFamilies(coarseUsageAfterThreeConcepts, []).has('tech'),
      'tech в 3 из 5 наборов должен блокироваться',
    );
  });

  it('байер выбрал исчерпавшее семейство — сборщик его отбрасывает (есть альтернатива)', () => {
    const tshirtFam = familyForType(detectConceptProductType(prod('t', 'Футболка', 'Одежда')));
    const pool = [
      prod('tshirt', 'Футболка Premium', 'Одежда', 450),
      prod('mug', 'Кружка керамическая', 'Кружки', 400),
      prod('nb', 'Блокнот А5', 'Ежедневники и блокноты', 400),
      prod('bag', 'Сумка городская', 'Сумки и рюкзаки', 500),
    ];
    const out = assembleFromPool({
      pool,
      productIds: ['tshirt', 'mug', 'nb'], // байер поставил футболку первой
      ledger: ledger(),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 3000,
      brief: 'подарки команде',
      brandColors: [],
      fullCatalog: pool,
      blockedFamilies: new Set([tshirtFam]),
    });
    assert.ok(!out.some((p) => p.id === 'tshirt'), `выбор байера на лимите не отброшен: ${out.map((p) => p.id)}`);
    assert.ok(out.length >= 3, 'набор добран до min альтернативами');
  });
});
