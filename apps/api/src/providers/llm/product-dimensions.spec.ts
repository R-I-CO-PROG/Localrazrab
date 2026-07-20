import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDimensionsString,
  parseWeightToGrams,
  parseDimensionsFromText,
  longestDimensionCm,
  sizeClassFromCm,
  typicalLongestCmForType,
  resolveProductSizeCm,
} from './product-dimensions.util';

describe('parseDimensionsString — форматы поставщиков', () => {
  it('Midocean «27x22x40 см»', () => {
    assert.deepEqual(parseDimensionsString('27x22x40 см'), { widthCm: 27, heightCm: 22, depthCm: 40 });
  });
  it('Oasis «25 х 33 х 4» (кириллическая х)', () => {
    assert.deepEqual(parseDimensionsString('25 х 33 х 4'), { widthCm: 25, heightCm: 33, depthCm: 4 });
  });
  it('Art24 «23.5cm/10cm/18cm» (слэш + cm + десятичная)', () => {
    assert.deepEqual(parseDimensionsString('23.5cm/10cm/18cm'), { widthCm: 23.5, heightCm: 10, depthCm: 18 });
  });
  it('«10×20 см» (× и два измерения)', () => {
    assert.deepEqual(parseDimensionsString('10×20 см'), { widthCm: 10, heightCm: 20 });
  });
  it('запятая как десятичный разделитель «12,5 х 12,5 х 34»', () => {
    assert.deepEqual(parseDimensionsString('12,5 х 12,5 х 34'), { widthCm: 12.5, heightCm: 12.5, depthCm: 34 });
  });
  it('мм нормализуются в см', () => {
    assert.deepEqual(parseDimensionsString('150x80 мм'), { widthCm: 15, heightCm: 8 });
  });
  it('пустая/мусорная строка → {}', () => {
    assert.deepEqual(parseDimensionsString(''), {});
    assert.deepEqual(parseDimensionsString('нет данных'), {});
  });
});

describe('parseWeightToGrams', () => {
  it('Midocean кг → граммы', () => {
    assert.equal(parseWeightToGrams('2.678', 'kg'), 2678);
    assert.equal(parseWeightToGrams('0.148', 'kg'), 148);
  });
  it('Oasis граммы', () => {
    assert.equal(parseWeightToGrams('1570', 'g'), 1570);
  });
  it('auto: дробное/малое → кг, целое ≥100 → граммы', () => {
    assert.equal(parseWeightToGrams('2.678'), 2678);
    assert.equal(parseWeightToGrams('0.148'), 148);
    assert.equal(parseWeightToGrams('1570'), 1570);
  });
  it('мусор → null', () => {
    assert.equal(parseWeightToGrams('—'), null);
    assert.equal(parseWeightToGrams('0'), null);
  });
});

describe('parseDimensionsFromText — из описаний', () => {
  it('«Высота 15 см»', () => {
    assert.deepEqual(parseDimensionsFromText('Стакан термо. Высота 15 см, объём 350 мл'), { heightCm: 15 });
  });
  it('«Диаметр купола: 110 см»', () => {
    assert.equal(parseDimensionsFromText('Зонт-трость. Диаметр купола: 110 см').widthCm, 110);
  });
  it('«Размер: 10×20 см» → парсит строку', () => {
    assert.deepEqual(parseDimensionsFromText('Флаер. Размер: 10×20 см, плотная бумага'), { widthCm: 10, heightCm: 20 });
  });
  it('«Размер товара: 34 x 7 x 7 см»', () => {
    assert.deepEqual(
      parseDimensionsFromText('Подарочная коробка. Размер товара: 34 x 7 x 7 см'),
      { widthCm: 34, heightCm: 7, depthCm: 7 },
    );
  });
  it('без размеров → {}', () => {
    assert.deepEqual(parseDimensionsFromText('Приятный подарок для коллег'), {});
  });
});

describe('longestDimensionCm / sizeClassFromCm', () => {
  it('самое длинное измерение', () => {
    assert.equal(longestDimensionCm({ widthCm: 27, heightCm: 22, depthCm: 40 }), 40);
    assert.equal(longestDimensionCm({}), null);
  });
  it('классы размера', () => {
    assert.equal(sizeClassFromCm(6), 'tiny');
    assert.equal(sizeClassFromCm(14), 'small');
    assert.equal(sizeClassFromCm(30), 'medium');
    assert.equal(sizeClassFromCm(55), 'large');
    assert.equal(sizeClassFromCm(120), 'oversized');
  });
});

describe('resolveProductSizeCm — каталог → тип → null', () => {
  it('реальные габариты имеют приоритет над типом', () => {
    const r = resolveProductSizeCm({ widthCm: 50, heightCm: 30 }, 'mug');
    assert.equal(r?.longestCm, 50);
    assert.equal(r?.source, 'catalog');
  });
  it('нет габаритов → типовой размер по типу', () => {
    const r = resolveProductSizeCm({}, 'backpack');
    assert.equal(r?.longestCm, typicalLongestCmForType('backpack'));
    assert.equal(r?.source, 'type');
  });
  it('кружка сильно меньше рюкзака (правильный относительный масштаб)', () => {
    const mug = resolveProductSizeCm({}, 'mug');
    const backpack = resolveProductSizeCm({}, 'backpack');
    assert.ok(mug && backpack && mug.longestCm < backpack.longestCm);
  });
  it('нет ни габаритов, ни типа → null', () => {
    assert.equal(resolveProductSizeCm({}, 'other'), null);
  });
});
