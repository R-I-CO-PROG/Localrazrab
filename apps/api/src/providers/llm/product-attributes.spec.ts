import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAttributesFromText,
  matchProductAttributes,
  formatAttributeMismatch,
} from './product-attributes.util';
import type { CatalogProduct } from './catalog.util';

function prod(name: string, description = ''): CatalogProduct {
  return {
    id: 'p1',
    name,
    category: 'Электроника',
    subcategory: null,
    description,
    price: 1000,
    stockAvailable: 500,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}

describe('extractAttributesFromText', () => {
  it('извлекает ёмкость из «Пауэрбанк на 5000 мАч, синий»', () => {
    const attrs = extractAttributesFromText('Пауэрбанк на 5000 мАч, синий');
    assert.deepEqual(
      attrs.map((a) => ({ kind: a.kind, value: a.value })),
      [{ kind: 'capacity_mah', value: 5000 }],
    );
  });

  it('понимает латиницу, пробелы-разряды и слитное написание', () => {
    assert.equal(extractAttributesFromText('powerbank 5 000 mAh')[0]?.value, 5000);
    assert.equal(extractAttributesFromText('Powerbank 10000mAh')[0]?.value, 10000);
    assert.equal(extractAttributesFromText('аккумулятор 5000мач')[0]?.value, 5000);
  });

  it('извлекает объём в мл и литрах (литры нормализуются в мл)', () => {
    assert.deepEqual(
      extractAttributesFromText('серая кружка 300 мл').map((a) => [a.kind, a.value]),
      [['volume_ml', 300]],
    );
    assert.deepEqual(
      extractAttributesFromText('бутылка 0,5 л').map((a) => [a.kind, a.value]),
      [['volume_ml', 500]],
    );
  });

  it('извлекает память и мощность', () => {
    assert.deepEqual(
      extractAttributesFromText('флешка 32 ГБ').map((a) => [a.kind, a.value]),
      [['memory_gb', 32]],
    );
    assert.deepEqual(
      extractAttributesFromText('зарядное устройство 20 Вт').map((a) => [a.kind, a.value]),
      [['power_w', 20]],
    );
  });

  it('не выдумывает атрибуты из цен, тиража и просто чисел', () => {
    assert.equal(extractAttributesFromText('подарки до 5000 рублей').length, 0);
    assert.equal(extractAttributesFromText('тираж 300 шт, бюджет 3000').length, 0);
    assert.equal(extractAttributesFromText('синий пауэрбанк').length, 0);
  });

  it('не путает мл и л (500 мл ≠ 500 л)', () => {
    const attrs = extractAttributesFromText('термос 500 мл стальной');
    assert.equal(attrs.length, 1);
    assert.equal(attrs[0].value, 500);
  });
});

describe('matchProductAttributes', () => {
  const req5000 = extractAttributesFromText('пауэрбанк 5000 мАч');

  it('точное совпадение: SKU с 5000 mAh в названии', () => {
    const r = matchProductAttributes(req5000, prod('Powerbank Slim 5000 mAh'));
    assert.equal(r.mismatches.length, 0);
    assert.equal(r.matched.length, 1);
  });

  it('совпадение по описанию, не только названию', () => {
    const r = matchProductAttributes(
      req5000,
      prod('Пауэрбанк Slim', 'Ёмкость аккумулятора 5000 мАч, USB-C'),
    );
    assert.equal(r.mismatches.length, 0);
  });

  it('расхождение: у SKU другая ёмкость — фиксируем requested и actual', () => {
    const r = matchProductAttributes(req5000, prod('Powerbank Max 10000 mAh'));
    assert.equal(r.matched.length, 0);
    assert.deepEqual(r.mismatches, [
      { kind: 'capacity_mah', requested: 5000, actual: 10000 },
    ]);
  });

  it('атрибут не указан у SKU → mismatch с actual=null', () => {
    const r = matchProductAttributes(req5000, prod('Пауэрбанк ультратонкий'));
    assert.deepEqual(r.mismatches, [
      { kind: 'capacity_mah', requested: 5000, actual: null },
    ]);
  });

  it('скор: точное > близкое-неточное > неизвестное > далёкое', () => {
    const exact = matchProductAttributes(req5000, prod('Powerbank 5000 mAh')).score;
    const close = matchProductAttributes(req5000, prod('Powerbank 6000 mAh')).score;
    const unknown = matchProductAttributes(req5000, prod('Пауэрбанк без цифр')).score;
    const far = matchProductAttributes(req5000, prod('Powerbank 30000 mAh')).score;
    assert.ok(exact > close, 'exact > close');
    assert.ok(close > unknown, 'close > unknown');
    assert.ok(unknown > far, 'unknown > far');
  });

  it('без запрошенных атрибутов — нейтральный результат', () => {
    const r = matchProductAttributes([], prod('Powerbank 5000 mAh'));
    assert.equal(r.mismatches.length, 0);
    assert.equal(r.score, 0);
  });
});

describe('formatAttributeMismatch', () => {
  it('человекочитаемые пометки по-русски', () => {
    assert.equal(
      formatAttributeMismatch({ kind: 'capacity_mah', requested: 5000, actual: 10000 }),
      '10000 мАч вместо 5000 мАч',
    );
    assert.equal(
      formatAttributeMismatch({ kind: 'capacity_mah', requested: 5000, actual: null }),
      'ёмкость (мАч) не указана у товара',
    );
    assert.equal(
      formatAttributeMismatch({ kind: 'volume_ml', requested: 300, actual: 450 }),
      '450 мл вместо 300 мл',
    );
  });
});
