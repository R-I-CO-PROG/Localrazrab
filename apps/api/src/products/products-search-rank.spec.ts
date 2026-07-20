import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankProductsBySearch, productSearchBaseName } from './products-search-rank';

describe('productSearchBaseName — схлопывание вариантов', () => {
  it('срезает цвет-хвост после разделителя', () => {
    assert.equal(
      productSearchBaseName('Americano® Piccolo кружка объемом 100 мл - Белый'),
      'americano® piccolo кружка объемом 100 мл',
    );
    assert.equal(
      productSearchBaseName('EXPRESS. Чашка для путешествия 310 мл, Красный'),
      'express. чашка для путешествия 310 мл',
    );
  });

  it('цвето-варианты одного товара дают одну базу', () => {
    const a = productSearchBaseName('Corzo медная чашка, 350 мл - Белый');
    const b = productSearchBaseName('Corzo медная чашка, 350 мл - Бронзовый');
    assert.equal(a, b);
  });

  it('размер без разделителя (пробел) НЕ режется — разные товары остаются разными', () => {
    assert.notEqual(
      productSearchBaseName('EXPRESS. Чашка для путешествия 310 мл'),
      productSearchBaseName('LARRY. Чашка для путешествия 520 мл'),
    );
  });

  it('многословный хвост подарочного набора НЕ срезается (не путаем разные наборы)', () => {
    const base = productSearchBaseName('Подарочный набор c блокнотом С1, ручкой и повербанком 5000 mAh');
    assert.ok(base.includes('ручкой и повербанком'));
  });
});

describe('rankProductsBySearch — релевантность', () => {
  it('слово целиком выше, чем словоформа-подстрока («ручка» ≠ «ручками»)', () => {
    const pool = [
      { name: 'Austin, скакалка с мягкими ручками в чехле' },
      { name: 'AERO. Шариковая ручка' },
    ];
    const ranked = rankProductsBySearch(pool, 'ручка');
    assert.equal(ranked[0].name, 'AERO. Шариковая ручка');
  });

  it('точное совпадение имени — на первом месте', () => {
    const pool = [
      { name: 'Большая кружка керамическая' },
      { name: 'Кружка' },
      { name: 'ANISEED. Сублимационная кружка 350мл' },
    ];
    const ranked = rankProductsBySearch(pool, 'кружка');
    assert.equal(ranked[0].name, 'Кружка');
  });

  it('точный артикул (externalId) — на первом месте', () => {
    const pool = [
      { name: 'Случайный товар', externalId: 'XYZ' },
      { name: 'Ручка синяя', externalId: '514209' },
    ];
    const ranked = rankProductsBySearch(pool, '514209');
    assert.equal(ranked[0].externalId, '514209');
  });

  it('схлопывает цвето-варианты: один Corzo вместо шести', () => {
    const pool = ['Белый', 'Бронзовый', 'Красный', 'Синий'].map((c) => ({
      name: `Corzo медная чашка, 350 мл - ${c}`,
    }));
    pool.push({ name: 'EXPRESS. Чашка для путешествия 310 мл' });
    const ranked = rankProductsBySearch(pool, 'чашка');
    const corzo = ranked.filter((p) => p.name.startsWith('Corzo'));
    assert.equal(corzo.length, 1);
    assert.equal(ranked.length, 2);
  });

  it('при равном ранге короче имя выше', () => {
    const pool = [
      { name: 'Термокружка вакуумная с двойными стенками премиум' },
      { name: 'Термокружка' },
    ];
    const ranked = rankProductsBySearch(pool, 'термокружка');
    assert.equal(ranked[0].name, 'Термокружка');
  });
});
