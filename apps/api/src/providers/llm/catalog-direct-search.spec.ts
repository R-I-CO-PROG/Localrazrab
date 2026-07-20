import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSingleProductBrief,
  detectSingleProductType,
  estimateSetSizeFromBrief,
  searchDirectCatalogProducts,
} from './catalog-direct-search.util';
import { parseItemCountBounds } from './parse-desired-count';
import { resolveProductCountBounds } from './product-count-bounds.util';
import { resolveNamedItemsForBrief, resolveNamedPositionSpecsForBrief } from '../../requests/named-positions.util';
import type { CatalogProduct } from './catalog.util';

function pb(name: string, price = 1200, stock = 100): CatalogProduct {
  return {
    id: name, name, category: 'Электроника и гаджеты', subcategory: 'Аккумуляторы', description: '',
    price, stockAvailable: stock, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/p.jpg', imageUrl: 'https://cdn.example.com/p.jpg',
  } as CatalogProduct;
}

describe('Само-определение точечного запроса (задача 1)', () => {
  it('«белый повербанк на 5000 мАч» → точечный запрос одного товара', () => {
    const brief = 'белый повербанк на 5000 мАч';
    const named = resolveNamedItemsForBrief(brief, []);
    assert.equal(named.namedTypes.length, 1);
    assert.equal(isSingleProductBrief(brief, named.namedTypes, 5), true);
  });

  it('бриф-набор/аудитория → НЕ точечный', () => {
    const brief = 'нужен подарочный набор для сотрудников IT-компании, что-то технологичное';
    const named = resolveNamedItemsForBrief(brief, []);
    assert.equal(isSingleProductBrief(brief, named.namedTypes, 5), false);
  });

  it('несколько названных типов → НЕ точечный', () => {
    assert.equal(isSingleProductBrief('повербанк, ежедневник и ручка', ['powerbank', 'diary', 'pen'], 5), false);
  });

  it('короткий продуктовый бриф с 1 типом → точечный', () => {
    assert.equal(isSingleProductBrief('синяя термокружка 400 мл', ['thermos_mug'], 5), true);
  });
});

describe('Точечный запрос БЕЗ указания кол-ва (задача «оранжевые полотенца»)', () => {
  it('detectSingleProductType знает товары вне slug-таксономии и цвет/атрибуты не мешают', () => {
    const cases: Array<[string, string]> = [
      ['полотенце оранжевое до 1000 руб, тираж 250, цвета жёлтый оранжевый', 'towel'],
      ['коврик для мыши большой', 'mousepad'],
      ['визитница кожаная', 'cardholder'],
      ['настольная лампа с зарядкой', 'lamp'],
      ['наушники беспроводные', 'headphones'],
      ['носки цветные', 'socks'],
      ['ароматическая свеча', 'candle'],
      ['очки солнцезащитные', 'sunglasses'],
    ];
    for (const [brief, slug] of cases) {
      assert.equal(detectSingleProductType(brief)?.slug, slug, `бриф "${brief}"`);
    }
  });

  it('«термокружка» = одно семейство (drinkware) → thermos_mug, а не два товара', () => {
    assert.equal(detectSingleProductType('термокружка 400 мл')?.slug, 'thermos_mug');
  });

  it('два разных семейства товаров → это набор, не точечный (null)', () => {
    assert.equal(detectSingleProductType('полотенце и плед в подарок'), null);
    assert.equal(detectSingleProductType('кружка и ежедневник коллеге'), null);
  });

  it('длинный бриф одного товара БЕЗ явного кол-ва → точечный (раньше падал из-за >8 слов)', () => {
    const brief = 'нужно полотенце стоимостью до 1000 руб, тираж 250 шт, цвета жёлтый оранжевый';
    assert.equal(isSingleProductBrief(brief, ['towel'], 4, false), true);
  });

  it('пользователь ЯВНО попросил набор из ≥2 (countExplicit) → НЕ точечный', () => {
    assert.equal(isSingleProductBrief('полотенце оранжевое', ['towel'], 3, true), false);
  });

  it('поиск матчит тип по ИМЕНИ (nameMatch) и ставит запрошенный цвет первым', () => {
    const tw = (name: string): CatalogProduct => ({
      id: name, name, category: 'Текстиль', subcategory: 'Полотенца', description: '',
      price: 800, stockAvailable: 500, colors: [], silhouetteImageUrl: '',
      catalogImageUrl: 'https://cdn.example.com/t.jpg', imageUrl: 'https://cdn.example.com/t.jpg',
    } as CatalogProduct);
    const catalog = [
      tw('Полотенце махровое серое'),
      tw('Полотенце махровое оранжевое'),
      tw('Полотенце махровое красное'),
      tw('Рюкзак городской чёрный'), // не полотенце — не должен попасть
    ];
    const res = searchDirectCatalogProducts({
      catalog,
      namedType: 'towel',
      spec: { label: 'полотенце', attributes: [], colors: ['оранжевый', 'жёлтый'] },
      budgetPerSet: 1000,
      brandColors: ['оранжевый', 'жёлтый'],
      tirage: 250,
      limit: 5,
      nameMatch: /полотенц/i,
    });
    assert.ok(res.length >= 1);
    assert.match(res[0].name, /оранжев/i, `первым должно быть оранжевое, порядок: ${res.map((p) => p.name).join(' | ')}`);
    assert.ok(!res.some((p) => /рюкзак/i.test(p.name)), 'рюкзак не полотенце — не в результатах');
  });
});

describe('Батч 3: роутинг/интенция (R1–R5)', () => {
  it('R1: «рюкзак и косметичка» (2 слага одной семьи bag) → НЕ точечный', () => {
    assert.equal(detectSingleProductType('рюкзак и косметичка'), null);
    assert.equal(detectSingleProductType('термокружка и кружка'), null);
    // одиночный товар — по-прежнему точечный
    assert.equal(detectSingleProductType('термокружка 400 мл')?.slug, 'thermos_mug');
    assert.equal(detectSingleProductType('рюкзак чёрный')?.slug, 'backpack');
  });

  it('R5: голое «в подарок» больше НЕ признак набора (точечный запрос)', () => {
    assert.equal(isSingleProductBrief('термокружка белая в подарок', ['thermos_mug'], 4, false), true);
    assert.equal(isSingleProductBrief('кружка на день кофе', ['mug'], 4, false), true);
    // но «подарочный набор» и аудитория — по-прежнему набор
    assert.equal(isSingleProductBrief('подарочный набор коллегам', ['mug'], 4, false), false);
    assert.equal(isSingleProductBrief('кружка сотрудникам на день рождения', ['mug'], 4, false), false);
  });

  it('R2: явное число >8 больше не теряется (кламп до 12), тираж «250 шт» — не число товаров', () => {
    assert.deepEqual(parseItemCountBounds('набор из 10 позиций'), { min: 10, max: 10 });
    assert.deepEqual(parseItemCountBounds('набор из 12 предметов'), { min: 12, max: 12 });
    assert.equal(parseItemCountBounds('полотенце, тираж 250 шт'), null); // 250 — тираж, не кол-во
  });

  it('R2 (ревью): «N лет/сотрудников/…» — НЕ число товаров, но «N кружек» — да', () => {
    assert.equal(parseItemCountBounds('10 лет компании, нужны подарки'), null);
    assert.equal(parseItemCountBounds('12 сотрудников'), null);
    assert.equal(parseItemCountBounds('подарки на 5 лет стажа'), null);
    assert.deepEqual(parseItemCountBounds('10 кружек'), { min: 10, max: 10 });
  });

  it('R5 (ревью): «новый год», дательное «ко дню X», персонал/работник, выпускной → набор', () => {
    const set = (b: string, slug: string) => assert.equal(isSingleProductBrief(b, [slug], 4, false), false, b);
    set('термокружки на новый год персоналу', 'thermos_mug');
    set('кружки с новым годом', 'mug');
    set('ежедневники ко дню строителя', 'notebook');
    set('подарки ко дню рождения директора', 'mug');
    set('кружки работникам склада', 'mug');
    set('футболки на выпускной', 'tshirt');
  });

  it('R4: capBySemanticBudget реально режет («застолье» на 1000₽ → 3, не 5)', () => {
    const bounds = resolveProductCountBounds({
      userPrompt: 'идея для застолья',
      budgetPerSet: 1000,
      useProductCountLimit: false,
    });
    assert.equal(bounds.max, 3, `ожидали max=3, получили ${bounds.max}`);
  });

  it('G1: жёсткий forbidden-цвет — direct-search вообще не показывает запрещённый цвет (не только ранжирует ниже)', () => {
    const catalog = [
      pb('Внешний аккумулятор 5000 мАч, чёрный', 1200),
      pb('Внешний аккумулятор 5000 мАч, белый', 1200),
    ];
    catalog[0].id = 'black';
    catalog[1].id = 'white';
    const res = searchDirectCatalogProducts({
      catalog,
      namedType: 'powerbank',
      budgetPerSet: 3000,
      limit: 5,
      brief: 'повербанк, без чёрного цвета категорически',
    });
    assert.ok(!res.some((p) => p.id === 'black'), 'запрещённый чёрный не показан вообще');
    assert.ok(res.some((p) => p.id === 'white'));
  });

  it('G1: цвето-критичный клеш с брендом жёсткий в direct-search (не только желаемый цвет мягко ранжируется)', () => {
    const catalog = [
      pb('Плед флисовый, фуксия', 900),
      pb('Плед флисовый, синий', 900),
    ];
    catalog[0].category = 'Текстиль';
    catalog[0].id = 'fuchsia';
    catalog[1].category = 'Текстиль';
    catalog[1].id = 'blue';
    const res = searchDirectCatalogProducts({
      catalog,
      namedType: 'blanket',
      budgetPerSet: 3000,
      limit: 5,
      brandColors: ['синий'],
    });
    assert.ok(!res.some((p) => p.id === 'fuchsia'), 'фуксия при синем бренде не проходит цвето-критичный клеш');
  });

  it('R3: excludeIds исключает blacklist/предыдущие SKU из точечной выборки', () => {
    const catalog = [
      pb('Внешний аккумулятор 5000 мАч, белый', 1200),
      pb('Внешний аккумулятор 5000 мАч, чёрный', 1200),
    ];
    catalog[0].id = 'prev';
    catalog[1].id = 'fresh';
    const res = searchDirectCatalogProducts({
      catalog,
      namedType: 'powerbank',
      budgetPerSet: 3000,
      limit: 5,
      excludeIds: new Set(['prev']),
    });
    assert.ok(!res.some((p) => p.id === 'prev'), 'исключённый SKU не в выборке');
    assert.ok(res.some((p) => p.id === 'fresh'));
  });
});

describe('Динамический размер набора по смыслу брифа (задача «сам думай сколько»)', () => {
  it('точечный товар → 1 позиция', () => {
    assert.deepEqual(estimateSetSizeFromBrief('полотенце оранжевое'), { min: 1, max: 1 });
    assert.deepEqual(estimateSetSizeFromBrief('синяя кружка'), { min: 1, max: 1 });
  });
  it('«застолье»/сюжетная тема → крупный набор 5-7', () => {
    assert.deepEqual(estimateSetSizeFromBrief('идея для застолья'), { min: 5, max: 7 });
    assert.deepEqual(estimateSetSizeFromBrief('набор для пикника на природе'), { min: 5, max: 7 });
    assert.deepEqual(estimateSetSizeFromBrief('чаепитие в офисе'), { min: 5, max: 7 });
  });
  it('перечислено несколько товаров → набор примерно из стольких позиций', () => {
    assert.deepEqual(estimateSetSizeFromBrief('кружка, ежедневник и рюкзак'), { min: 3, max: 4 });
  });
  it('нейтральный бриф без темы/товара → null (решает бюджет/дефолт)', () => {
    assert.equal(estimateSetSizeFromBrief('подарок для партнёров'), null);
    assert.equal(estimateSetSizeFromBrief('Welcome Pack'), null);
  });
});

describe('Прямой поиск по каталогу под именованный товар', () => {
  it('«белый повербанк на 5000 мАч» → первым идёт белый 5000 мАч', () => {
    const spec = resolveNamedPositionSpecsForBrief('белый повербанк на 5000 мАч')['powerbank'];
    const catalog = [
      pb('Внешний аккумулятор 10000 мАч, чёрный'),
      pb('Внешний аккумулятор 5000 мАч, белый'),
      pb('Внешний аккумулятор 4000 мАч, белый'),
      pb('Внешний аккумулятор 5000 мАч, чёрный'),
      pb('Термокружка стальная 400 мл'), // не повербанк — не должен попасть
    ];
    const res = searchDirectCatalogProducts({
      catalog, namedType: 'powerbank', spec, budgetPerSet: 3000, brandColors: [], forbiddenItems: [], tirage: null, limit: 5,
    });
    assert.ok(res.length >= 1, 'нашёл хотя бы один');
    assert.match(res[0].name, /5000.*бел|бел.*5000/i, `первый: ${res[0]?.name}`);
    // термокружка не повербанк — её нет в результатах
    assert.ok(!res.some((p) => /термокружк/i.test(p.name)));
  });

  it('нет идеального «белый 5000» → белые всплывают выше не-белых 5000 (цвет не топится)', () => {
    const spec = resolveNamedPositionSpecsForBrief('белый повербанк на 5000 мАч')['powerbank'];
    const catalog = [
      pb('Внешний аккумулятор 5000 мАч, чёрный'),
      pb('Внешний аккумулятор 10000 мАч, белый'),
      pb('Внешний аккумулятор 5000 мАч, красный'),
    ];
    const res = searchDirectCatalogProducts({
      catalog, namedType: 'powerbank', spec, budgetPerSet: 3000, limit: 5,
    });
    // белый (совпал цвет) должен идти не ниже, чем не-белые 5000 (совпал только атрибут)
    const whiteIdx = res.findIndex((p) => /бел/i.test(p.name));
    assert.ok(whiteIdx === 0, `белый должен быть первым, порядок: ${res.map((p) => p.name).join(' | ')}`);
  });

  it('запрещённые товары не попадают даже в прямой поиск', () => {
    const spec = resolveNamedPositionSpecsForBrief('повербанк')['powerbank'];
    const catalog = [pb('Внешний аккумулятор 5000 мАч, белый')];
    const res = searchDirectCatalogProducts({
      catalog, namedType: 'powerbank', spec, budgetPerSet: 3000, forbiddenItems: ['аккумуляторы'], limit: 5,
    });
    assert.equal(res.length, 0);
  });
});
