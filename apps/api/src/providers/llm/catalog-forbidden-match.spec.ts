import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productMatchesForbidden, filterOutForbidden, forbiddenTermPatterns } from './catalog-forbidden-match.util';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: '', price: 900,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

// Точная улика прогона 22:04 — исключения пользователя.
const FORBID = ['упаковки', 'пауэр банки', 'аккумуляторы', 'колонки беспроводные'];

// Ровно те 10 товаров, что утекли в наборы вопреки запретам.
const LEAKED = [
  'Беспроводная Bluetooth колонка Charge G2(BLTS01), черная-S',
  'Портативное зарядное устройство (power bank) Basis, 2000 mAh, черный',
  'Портативная колонка Concept с полноцетной печатью, черный',
  'Внешний аккумулятор Wolfrock с беспроводной зарядкой soft-touch покрытием, 10000 mAh, черный',
  'Портативная колонка «Tempo», белый',
  'Внешний аккумулятор с подсветкой Bplanner Power 4 ST, 8000 mAh (Красный)',
  'Беспроводная Bluetooth колонка Bardo, черный',
  'Портативное зарядное устройство "Брадуэлл", 2200 mAh, серебристый',
  'Лампа с колонкой и беспроводной зарядкой Alladin, черная',
  'Внешний аккумулятор со встроенным кабелем «Свифт», 4000 мАч, белый',
];

describe('P0: свободнотекстовые запреты (прогон 22:04)', () => {
  it('ВСЕ 10 утёкших товаров теперь распознаются как запрещённые', () => {
    for (const name of LEAKED) {
      assert.equal(productMatchesForbidden(p(name, 'Электроника и гаджеты'), FORBID), true, `не отсёкся: ${name}`);
    }
  });

  it('filterOutForbidden вычищает все 10 из пула', () => {
    const pool = LEAKED.map((n) => p(n, 'Электроника и гаджеты'));
    assert.equal(filterOutForbidden(pool, FORBID).length, 0);
  });

  it('легитимные настольные IT-товары НЕ отсекаются (нет ложных срабатываний)', () => {
    const ok = [
      p('Настольный органайзер деревянный', 'Офис'),
      p('Ежедневник недатированный А5', 'Ежедневники'),
      p('Настольная лампа с сенсором', 'Электроника'),
      p('USB-хаб на 4 порта Type-C', 'Электроника'),
      p('Беспроводная зарядка-подставка для телефона', 'Электроника'),
      p('Термокружка стальная 400 мл', 'Термосы'),
      p('Коврик для мыши тканевый', 'Офис'),
    ];
    for (const it of ok) {
      assert.equal(productMatchesForbidden(it, FORBID), false, `ложно отсёкся: ${it.name}`);
    }
  });

  it('кириллица↔латиница: «пауэр банки» ловит «power bank»', () => {
    assert.equal(productMatchesForbidden(p('Power Bank 5000 mAh'), ['пауэр банки']), true);
    assert.equal(productMatchesForbidden(p('Портативное зарядное устройство'), ['пауэр банки']), true);
  });

  it('«колонки беспроводные» ловит «Bluetooth колонка» и «портативная колонка»', () => {
    assert.equal(productMatchesForbidden(p('Bluetooth колонка Mini'), ['колонки беспроводные']), true);
    assert.equal(productMatchesForbidden(p('Портативная колонка Boom'), ['колонки беспроводные']), true);
  });

  it('«упаковки» ловит подарочную коробку, но НЕ обычные товары', () => {
    assert.equal(productMatchesForbidden(p('Подарочная коробка крафт'), ['упаковки']), true);
    assert.equal(productMatchesForbidden(p('Ежедневник А5'), ['упаковки']), false);
  });

  it('стеммер: «аккумуляторы» → основа «аккумулятор» ловит «Внешний аккумулятор»', () => {
    assert.ok(forbiddenTermPatterns('аккумуляторы').length > 0);
    assert.equal(productMatchesForbidden(p('Внешний аккумулятор 10000'), ['аккумуляторы']), true);
  });

  it('catch-all «Другое» ничего не фильтрует', () => {
    assert.equal(forbiddenTermPatterns('Другое').length, 0);
    assert.equal(productMatchesForbidden(p('Внешний аккумулятор'), ['Другое']), false);
  });

  it('пустой список запретов — всё проходит', () => {
    assert.equal(productMatchesForbidden(p('Power Bank'), []), false);
    assert.equal(filterOutForbidden([p('Power Bank')], []).length, 1);
  });
});

describe('C2: семьи еда/алкоголь/чай-кофе (короткие термины через курируемые семьи)', () => {
  const yes = (name: string, forbid: string[], cat = 'Прочее') =>
    assert.equal(productMatchesForbidden(p(name, cat), forbid), true, `не отсёкся: ${name} ⟂ ${forbid}`);
  const no = (name: string, forbid: string[], cat = 'Прочее') =>
    assert.equal(productMatchesForbidden(p(name, cat), forbid), false, `ложно отсёкся: ${name} ⟂ ${forbid}`);

  it('алкоголь: ловит вино/пиво/виски/коньяк по общему термину и по конкретному', () => {
    yes('Вино красное сухое', ['алкоголь']);
    yes('Пиво крафтовое светлое', ['алкоголь']);
    yes('Набор виски с камнями', ['алкоголь']);
    yes('Коньяк выдержанный подарочный', ['спиртное']);
    yes('Вино игристое брют', ['вино']);
    yes('Ликёр травяной', ['алкоголь']);
  });

  it('алкоголь: НЕ ловит виноград/винтаж/провинцию/безалкогольное-адъяцентное', () => {
    no('Виноградный сок 1л', ['вино']);
    no('Винтажные часы наручные', ['вино']);
    no('Ежедневник Провинция А5', ['вино']);
    no('Ромашковый чай', ['ром']); // ром внутри «ромашк» не должен ловиться
  });

  it('еда/сладости: ловит шоколад/конфеты/печенье/продуктовый набор', () => {
    yes('Шоколад молочный плитка', ['еда']);
    yes('Конфеты ассорти в коробке', ['сладости']);
    yes('Печенье овсяное', ['сладости']);
    yes('Продуктовый набор гурмана', ['еда']);
    yes('Шоколадный набор премиум', ['шоколад']);
    yes('Мармелад жевательный', ['еда']);
  });

  it('еда: НЕ ловит несъедобные товары', () => {
    no('Ежедневник недатированный А5', ['еда']);
    no('Плед флисовый', ['сладости']);
    no('Термокружка стальная', ['еда']);
  });

  it('еда: цвето-прилагательные сладостей НЕ ловятся (шоколадный плед ≠ еда)', () => {
    no('Плед флисовый шоколадный', ['еда']);
    no('Увлажнитель воздуха Bamboo, шоколадный', ['сладости']);
    no('Ежедневник Madrid зефирный голубой', ['еда']);
    // но реальная еда в пищевом контексте — ловится
    yes('Шоколадный набор ассорти', ['сладости']);
    yes('Попкорн карамельный', ['еда']);
    yes('Шоколад тёмный 70%', ['шоколад']);
  });

  it('nameOnly: посуда в категории «чай и кофе» НЕ ловится (матч только по имени)', () => {
    assert.equal(productMatchesForbidden(
      { id: 'x', name: 'Чайная пара Melissa', category: 'Посуда', subcategory: 'Посуда для чая и кофе', description: '' } as CatalogProduct,
      ['кофе'],
    ), false);
    assert.equal(productMatchesForbidden(
      { id: 'y', name: 'Набор бокалов', category: 'Посуда', subcategory: 'Бокалы для вина', description: '' } as CatalogProduct,
      ['вино'],
    ), false);
  });

  it('чай/кофе: ловит чай/кофе как продукт, но НЕ чайник/кофемолку/чайную пару', () => {
    yes('Чай чёрный листовой 100г', ['чай']);
    yes('Кофе молотый арабика', ['кофе']);
    yes('Чайный набор ассорти', ['чай']);
    yes('Кофейный набор зерновой', ['кофе']);
    no('Чайник заварочный стеклянный', ['чай']);
    no('Чайная пара фарфоровая', ['чай']);
    no('Кофемолка ручная', ['кофе']);
    no('Кофеварка гейзерная', ['кофе']);
    no('Кофейник керамический', ['кофе']);
    no('Термокружка 400 мл', ['чай']);
  });
});
