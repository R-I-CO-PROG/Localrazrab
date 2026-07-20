import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from './catalog-brief-relevance.util';
import { scoreGiftWorthiness, scoreArchetypeMatch, pickArchetypeForConcept, resolveAudienceArchetypes, GIFT_JUNK_PENALTY, ARCHETYPE_POSITIVE } from './catalog-context-scoring.util';
import { assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее', price = 600): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: name, price,
    stockAvailable: 500, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}
const rel = (name: string, brief: string, cat = 'Прочее', price = 600) =>
  scoreBriefRelevanceWithContext(p(name, cat, price), buildBriefRelevanceContext(brief, []));
const SALES = 'наборы для онбординга менеджеров по продажам';

describe('Рычаг 1: ярусный sales_onboarding', () => {
  beforeEach(() => clearProductTypeCache());
  it('визитница/папка для документов скорит ВЫШЕ базовой канцелярии', () => {
    const cardholder = rel('Визитница кожаная', SALES, 'Аксессуары');
    const folder = rel('Папка для документов «Делос»', SALES, 'Офис');
    const notebook = rel('Блокнот А5 на гребне', SALES, 'Ежедневники и блокноты');
    const pen = rel('Ручка шариковая Senator', SALES, 'Ручки');
    assert.ok(cardholder > notebook, `визитница ${cardholder} vs блокнот ${notebook}`);
    assert.ok(folder > pen, `папка ${folder} vs ручка ${pen}`);
  });
  it('флоральный дизайн («FLORA.Пионы») штрафуется в sales-брифе', () => {
    const flora = rel('ЕЖЕДНЕВНИК А6+ FLEX "FLORA.Пионы"', SALES, 'Ежедневники и блокноты');
    const plain = rel('Ежедневник недатированный А5, черный', SALES, 'Ежедневники и блокноты');
    assert.ok(plain - flora >= 40, `пионы ${flora} vs строгий ${plain}`);
  });
  it('но на 8 марта цветочный дизайн НЕ штрафуется этим правилом', () => {
    assert.ok(rel('ЕЖЕДНЕВНИК "FLORA.Пионы"', 'подарки на 8 марта женщинам-коллегам', 'Ежедневники и блокноты') > -40);
  });
});

describe('Рычаг 2: junk += авоська/чехол HDD/шнурок', () => {
  it('авоська/чехол для жёсткого диска/шнурок для телефона — штраф', () => {
    for (const n of ['Авоська Dream М "old style" 15 литров', 'Чехол для жесткого диска из кожзама', 'Шнурок для телефона на шею «Lanyard»']) {
      assert.equal(scoreGiftWorthiness(p(n)), GIFT_JUNK_PENALTY, n);
    }
  });
  it('бейдж-лента (ланьярд) НЕ штрафуется (легитим для онбординга)', () => {
    assert.equal(scoreGiftWorthiness(p('Лента для бейджа с карабином, синяя')), 0);
  });
});

describe('Рычаг 3: архетип-позитив не достаётся дешёвке', () => {
  beforeEach(() => clearProductTypeCache());
  it('блокнот за 133₽ НЕ получает +40 (при бюджете 3000)', () => {
    const arch = pickArchetypeForConcept('подарки врачам', 'Премиум набор');
    // найдём вариант, где writing в позитиве
    const cheap = scoreArchetypeMatch(p('Блокнот А6 «Write and stick»', 'Блокноты', 133), arch, 3000);
    assert.ok(cheap < ARCHETYPE_POSITIVE, `дешёвый блокнот получил ${cheap}`);
  });
  it('качественный товар того же типа получает позитив', () => {
    const care = resolveAudienceArchetypes('подарки врачам').find((v) => v.id === 'care');
    assert.ok(care, 'вариант care существует');
    assert.ok(scoreArchetypeMatch(p('Термос стальной 500 мл', 'Термосы', 900), care, 3000) >= ARCHETYPE_POSITIVE);
  });
});

describe('Round-2: профессиональная привязка + новые протечки', () => {
  beforeEach(() => clearProductTypeCache());
  it('врачу: фляжка/фитнес/настолка — архетипный анти', () => {
    const variants = resolveAudienceArchetypes('подарки врачам');
    for (const n of [['Фляжка 240 мл Remarque', 'Посуда'], ['Набор для фитнеса Balance с лентой', 'Отдых и спорт'], ['Карточная игра Reno', 'Игры']] as const) {
      assert.ok(variants.every((v) => scoreArchetypeMatch(p(n[0], n[1], 600), v, 3000) < 0), n[0]);
    }
  });
  it('врачу: маска для сна/бальзам/ланч-бокс — namePositive сильнее типа', () => {
    const care = resolveAudienceArchetypes('подарки врачам').find((v) => v.id === 'care');
    assert.ok(scoreArchetypeMatch(p('Маска для сна из шёлка', 'Аксессуары', 500), care, 3000) > ARCHETYPE_POSITIVE);
    assert.ok(scoreArchetypeMatch(p('Бальзам для рук увлажняющий', 'Косметика', 450), care, 3000) > ARCHETYPE_POSITIVE);
  });
  it('продажнику: папка руководителя/визитница — namePositive', () => {
    const pres = resolveAudienceArchetypes(SALES).find((v) => v.id === 'presentation');
    assert.ok(scoreArchetypeMatch(p('Папка руководителя William Lloyd', 'Офис', 900), pres, 3000) > ARCHETYPE_POSITIVE);
  });
  it('nameAnti: гольф/френч-пресс/косметичка/головоломка — архетипный анти для аудитории', () => {
    const sales = resolveAudienceArchetypes(SALES);
    for (const n of [['Набор для гольфа', 'Отдых'], ['Френч-пресс 600 мл', 'Посуда'], ['Косметичка DOEL', 'Аксессуары'], ['Головоломка деревянная «Цифры»', 'Игры']] as const) {
      assert.ok(sales.every((v) => scoreArchetypeMatch(p(n[0], n[1], 600), v, 3000) < 0), `sales ${n[0]}`);
    }
    const docs = resolveAudienceArchetypes('подарки врачам');
    for (const n of ['Сенсорный диспенсер Security', 'Док-станция для телефона', 'Набор для гольфа'])
      assert.ok(docs.every((v) => scoreArchetypeMatch(p(n, 'Прочее', 600), v, 3000) < 0), `doc ${n}`);
  });
  it('рюкзак-мешок и карточная игра — junk', () => {
    assert.equal(scoreGiftWorthiness(p('Рюкзак-мешок', 'Сумки')), GIFT_JUNK_PENALTY);
    assert.equal(scoreGiftWorthiness(p('Карточная игра Reno', 'Игры')), GIFT_JUNK_PENALTY);
  });
  it('outdoor-игрушки (фрисби/ракетки) врачу — reject; на пикник — ок', () => {
    const doc = 'подарки врачам на день медицинского работника';
    assert.ok(rel('Фрисби-раскраска "Лето"', doc, 'Отдых и спорт') <= -70);
    assert.ok(rel('Набор пляжных ракеток SALENTO', doc, 'Отдых и спорт') <= -70);
    assert.ok(rel('Набор для бадминтона', 'наборы для пикника и активного отдыха компании', 'Отдых и спорт') > -70);
  });
});

describe('Рычаг 4: staple-добор не тащит семейство в 4-й набор', () => {
  beforeEach(() => clearProductTypeCache());
  const mk = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');
  // фикстура: 3 позиции РАЗНЫХ семейств (keychain/drinkware/tech), тонкие по бюджету →
  // 3c пытается добрать заблокированный writing.
  const basePool = () => [
    p('Брелок сувенирный', 'Сувениры', 171),
    p('Кружка керамическая', 'Кружки', 400),
    p('USB-хаб компактный', 'Электроника', 734),
    p('Ежедневник кожзам А5', 'Ежедневники и блокноты', 800),
  ];
  const buyerIds = ['Брелок сувенирный', 'Кружка керамическая', 'USB-хаб компактный'];
  it('writing уже в 3 наборах → 3c НЕ воскрешает блокнот', () => {
    const pool = basePool();
    const out = assembleFromPool({
      pool, productIds: buyerIds,
      ledger: mk(), minItems: 3, maxItems: 5, budgetPerSet: 3000,
      brief: SALES, brandColors: [], fullCatalog: pool,
      blockedFamilies: new Set(['writing']),
      familyUsage: new Map([['writing', 3]]),
    });
    assert.ok(!out.some((x) => x.id === 'Ежедневник кожзам А5'), `writing в 4-м наборе: ${out.map((x) => x.id)}`);
  });
  it('writing в 2 наборах → 3c ещё МОЖЕТ добрать (бюджет важнее)', () => {
    const pool = basePool();
    const out = assembleFromPool({
      pool, productIds: buyerIds,
      ledger: mk(), minItems: 3, maxItems: 5, budgetPerSet: 3000,
      brief: SALES, brandColors: [], fullCatalog: pool,
      blockedFamilies: new Set(['writing']),
      familyUsage: new Map([['writing', 2]]),
    });
    assert.ok(out.some((x) => x.id === 'Ежедневник кожзам А5'), 'writing при 2 наборах должен добираться');
  });
});
