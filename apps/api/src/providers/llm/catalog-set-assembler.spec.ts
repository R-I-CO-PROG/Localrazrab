import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assembleSetFromChoices, assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import { detectConceptProductType } from './concept-diversity.util';
import type { CatalogProduct } from './catalog.util';
import type { SlotShortlist } from './catalog-neural-selector.types';

function prod(
  id: string,
  name: string,
  category: string,
  price: number,
): CatalogProduct {
  return {
    id,
    name,
    category,
    subcategory: null,
    description: name,
    price,
    stockAvailable: 50,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

describe('assembleSetFromChoices', () => {
  beforeEach(() => clearProductTypeCache());

  it('honors valid LLM choices', () => {
    const sl: SlotShortlist[] = [
      { slot: { type: 'thermos', priority: 'must' }, candidates: [prod('A', 'Термокружка', 'Термосы и бутылки', 500), prod('B', 'Термос дорожный', 'Термосы и бутылки', 700)] },
      { slot: { type: 'notebook', priority: 'nice' }, candidates: [prod('C', 'Блокнот A5', 'Ежедневники и блокноты', 300)] },
      { slot: { type: 'bag', priority: 'nice' }, candidates: [prod('D', 'Рюкзак городской', 'Сумки и рюкзаки', 900)] },
    ];
    const out = assembleSetFromChoices({
      shortlists: sl,
      selection: { choices: [{ slotIndex: 0, productId: 'B' }, { slotIndex: 1, productId: 'C' }, { slotIndex: 2, productId: 'D' }] },
      ledger: ledger(), minItems: 3, maxItems: 5, budgetPerSet: 3000, brief: 'набор', brandColors: [], fullCatalog: sl.flatMap((s) => s.candidates),
    });
    assert.deepEqual(out.map((p) => p.id).sort(), ['B', 'C', 'D']);
  });

  it('backfills to minItems when LLM choice is invalid', () => {
    const sl: SlotShortlist[] = [
      { slot: { type: 'thermos', priority: 'must' }, candidates: [prod('A', 'Термокружка', 'Термосы и бутылки', 500)] },
      { slot: { type: 'notebook', priority: 'nice' }, candidates: [prod('C', 'Блокнот A5', 'Ежедневники и блокноты', 300)] },
      { slot: { type: 'bag', priority: 'nice' }, candidates: [prod('D', 'Рюкзак городской', 'Сумки и рюкзаки', 900)] },
    ];
    const out = assembleSetFromChoices({
      shortlists: sl,
      selection: { choices: [{ slotIndex: 0, productId: 'ZZZ' }] },
      ledger: ledger(), minItems: 3, maxItems: 5, budgetPerSet: 3000, brief: 'набор', brandColors: [], fullCatalog: sl.flatMap((s) => s.candidates),
    });
    assert.ok(out.length >= 3);
  });

  it('never returns duplicates', () => {
    const sl: SlotShortlist[] = [
      { slot: { type: 'thermos', priority: 'must' }, candidates: [prod('A', 'Термокружка', 'Термосы и бутылки', 500)] },
      { slot: { type: 'thermos', priority: 'nice' }, candidates: [prod('A', 'Термокружка', 'Термосы и бутылки', 500)] },
    ];
    const out = assembleSetFromChoices({
      shortlists: sl,
      selection: { choices: [{ slotIndex: 0, productId: 'A' }, { slotIndex: 1, productId: 'A' }] },
      ledger: ledger(), minItems: 1, maxItems: 5, budgetPerSet: 3000, brief: 'набор', brandColors: [], fullCatalog: sl.flatMap((s) => s.candidates),
    });
    assert.equal(new Set(out.map((p) => p.id)).size, out.length);
  });

  it('tops up toward budget floor with new diverse items', () => {
    const sl: SlotShortlist[] = [
      { slot: { type: 'thermos', priority: 'must' }, candidates: [prod('A', 'Термокружка', 'Термосы и бутылки', 300)] },
    ];
    const fullCatalog = [
      prod('A', 'Термокружка', 'Термосы и бутылки', 300),
      prod('C', 'Блокнот A5', 'Ежедневники и блокноты', 400),
      prod('D', 'Рюкзак городской', 'Сумки и рюкзаки', 900),
      prod('E', 'Ручка металлическая', 'Ручки', 500),
      prod('F', 'Повербанк', 'Электроника', 700),
    ];
    const out = assembleSetFromChoices({
      shortlists: sl,
      selection: { choices: [{ slotIndex: 0, productId: 'A' }] },
      ledger: ledger(), minItems: 1, maxItems: 5, budgetPerSet: 3000, brief: 'набор сотрудникам', brandColors: [], fullCatalog,
    });
    assert.ok(out.length > 1, `expected budget top-up to add items, got ${out.length}`);
    assert.equal(new Set(out.map((p) => p.id)).size, out.length);
  });
});

describe('assembleFromPool — обязательные типы (mandatoryTypes)', () => {
  beforeEach(() => clearProductTypeCache());

  it('включает названный тип, даже если байер его не выбрал', () => {
    const pool = [
      prod('BAG', 'Рюкзак городской', 'Сумки и рюкзаки', 1200),
      prod('NB', 'Блокнот A5', 'Ежедневники и блокноты', 400),
      prod('PB', 'Внешний повербанк 10000 мАч', 'Электроника', 1500),
    ];
    const out = assembleFromPool({
      pool,
      productIds: ['BAG', 'NB'], // байер НЕ выбрал повербанк
      ledger: ledger(),
      minItems: 1,
      maxItems: 2,
      budgetPerSet: 3000,
      brief: 'жёлтые повербанки',
      brandColors: [],
      fullCatalog: pool,
      mandatoryTypes: ['powerbank'],
    });
    assert.ok(
      out.some((p) => detectConceptProductType(p) === 'powerbank'),
      `no powerbank in ${out.map((p) => p.id).join(',')}`,
    );
  });

  it('меняет обязательный тип на нужный цвет — жёлтый, а НЕ чёрный/оранжевый', () => {
    const black: CatalogProduct = {
      ...prod('PBK', 'Внешний аккумулятор ST 10000', 'Электроника', 1290),
      colors: [{ name: 'черный', hex: null, code: null }],
    };
    // Оранжевый — обобщённый RGB-скор считает его «жёлтым», но семейство иное → не должен победить.
    const orange: CatalogProduct = {
      ...prod('PBO', 'Внешний аккумулятор ST 10000 софт-тач', 'Электроника', 1290),
      colors: [{ name: 'оранжевый', hex: null, code: null }],
    };
    const yellow: CatalogProduct = {
      ...prod('PBY', 'Внешний аккумулятор ST 10000', 'Электроника', 1290),
      colors: [{ name: 'желтый', hex: null, code: null }],
    };
    const pool = [black, orange, yellow, prod('MUG', 'Кружка керамика', 'Кружки', 300)];
    const out = assembleFromPool({
      pool,
      productIds: ['PBK', 'MUG'], // байер выбрал ЧЁРНЫЙ повербанк
      ledger: ledger(),
      minItems: 1,
      maxItems: 2,
      budgetPerSet: 2000,
      brief: 'жёлтые повербанки 10000',
      brandColors: ['#EAB308'],
      fullCatalog: pool,
      mandatoryTypes: ['powerbank'],
    });
    assert.ok(out.some((p) => p.id === 'PBY'), `expected YELLOW powerbank, got ${out.map((p) => p.id).join(',')}`);
    assert.ok(!out.some((p) => p.id === 'PBK'), 'black should be swapped');
    assert.ok(!out.some((p) => p.id === 'PBO'), 'orange must NOT win over yellow');
  });

  it('защищает обязательный тип от бюджетного тримминга', () => {
    const pool = [
      prod('PB', 'Внешний повербанк 10000 мАч', 'Электроника', 1900),
      prod('MUG', 'Кружка керамическая', 'Кружки', 300),
    ];
    const out = assembleFromPool({
      pool,
      productIds: ['MUG', 'PB'],
      ledger: ledger(),
      minItems: 1,
      maxItems: 2,
      budgetPerSet: 2000, // cap=2000; повербанк дорогой, но обязателен → не режем его
      brief: 'повербанк',
      brandColors: [],
      fullCatalog: pool,
      mandatoryTypes: ['powerbank'],
    });
    assert.ok(out.some((p) => p.id === 'PB'), `powerbank must survive, got ${out.map((p) => p.id).join(',')}`);
  });

  it('G5: reject(архетип-анти) не пускает товар в набор даже через relaxed-добор из fullCatalog', () => {
    // Пул тонкий (1 позиция) → сборщик уходит в relaxed()-добор из fullCatalog до minItems=3.
    const pool = [prod('MUG', 'Кружка керамическая', 'Кружки', 400)];
    // В сыром fullCatalog есть «архетип-анти» товар (эмуляция: гольф врачу) — reject обязан его
    // не пустить даже когда набор недобран до min.
    const fullCatalog = [
      prod('MUG', 'Кружка керамическая', 'Кружки', 400),
      prod('GOLF', 'Набор для гольфа подарочный', 'Спорт', 800),
      prod('NB', 'Блокнот А5', 'Ежедневники и блокноты', 350),
      prod('PEN', 'Ручка металлическая', 'Ручки', 250),
    ];
    const out = assembleFromPool({
      pool,
      productIds: ['MUG'],
      ledger: ledger(),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 5000,
      brief: 'подарки врачам',
      brandColors: [],
      fullCatalog,
      reject: (p) => /гольф/i.test(p.name),
    });
    assert.ok(!out.some((p) => p.id === 'GOLF'), `архетип-анти гольф просочился: ${out.map((p) => p.id).join(',')}`);
    assert.ok(out.length >= 2, `набор всё равно добран не-анти позициями: ${out.map((p) => p.id).join(',')}`);
  });

  it('G5: reject освобождает ОБЯЗАТЕЛЬНЫЙ тип (контракт важнее архетип-эвристики)', () => {
    const pool = [prod('MUG', 'Кружка керамическая', 'Кружки', 400)];
    const fullCatalog = [
      prod('MUG', 'Кружка керамическая', 'Кружки', 400),
      // «гольф-клюшка» — mandatory тип golf_club (эмуляция) и одновременно матчит reject:
      // exemption обязан её пропустить.
      prod('GOLF', 'Клюшка для гольфа титановая', 'Спорт', 1200),
      prod('NB', 'Блокнот А5', 'Ежедневники и блокноты', 350),
    ];
    const golfType = detectConceptProductType(prod('x', 'Клюшка для гольфа титановая', 'Спорт', 1200));
    const out = assembleFromPool({
      pool,
      productIds: ['MUG'],
      ledger: ledger(),
      minItems: 2,
      maxItems: 4,
      budgetPerSet: 5000,
      brief: 'спортивный набор',
      brandColors: [],
      fullCatalog,
      mandatoryTypes: [golfType],
      reject: (p) => /гольф/i.test(p.name),
    });
    assert.ok(out.some((p) => p.id === 'GOLF'), `mandatory тип обязан пройти reject-exemption: ${out.map((p) => p.id).join(',')}`);
  });
});
