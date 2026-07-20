import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateImprints, type ImprintToValidate } from './imprint-validation';

const place = (cx: number, cy: number, w = 0.2, h = 0.2) => ({ cx, cy, w, h, rotation: 0 });

const base: ImprintToValidate = {
  methodCode: 'PAD_PRINT',
  colorCount: 1,
  placement: place(0.5, 0.5),
};

const codes = (ws: ReturnType<typeof validateImprints>) => ws.map((w) => w.code).sort();

describe('validateImprints', () => {
  it('корректное нанесение не даёт предупреждений', () => {
    assert.deepEqual(validateImprints([{ ...base, sizeMm: { w: 40, h: 20 } }], {}), []);
  });

  it('размер больше лимита метода', () => {
    const ws = validateImprints([{ ...base, sizeMm: { w: 80, h: 20 } }], {});
    assert.deepEqual(codes(ws), ['SIZE_OVER_METHOD']);
    assert.match(ws[0].messageRu, /50/);
  });

  it('цветность выше лимита метода', () => {
    const ws = validateImprints([{ ...base, colorCount: 6 }], {});
    assert.deepEqual(codes(ws), ['COLORS_OVER_METHOD']);
  });

  it('лазер по цветному: цветность > 1', () => {
    const ws = validateImprints([{ ...base, methodCode: 'LASER_ENGRAVING', colorCount: 3 }], {});
    assert.ok(ws.some((w) => w.code === 'COLORS_OVER_METHOD'));
  });

  it('размер больше зоны из каталога', () => {
    const ws = validateImprints(
      [
        {
          ...base,
          sizeMm: { w: 45, h: 20 },
          zone: { zoneName: 'на клипе', maxWidthMm: 30, maxHeightMm: 10, maxAreaMm2: null, maxColors: null },
        },
      ],
      {},
    );
    assert.deepEqual(codes(ws), ['SIZE_OVER_ZONE']);
  });

  it('площадь больше зоны из каталога (oasis отдаёт только площадь)', () => {
    const ws = validateImprints(
      [
        {
          ...base,
          sizeMm: { w: 40, h: 40 },
          zone: { zoneName: 'на обложке', maxWidthMm: null, maxHeightMm: null, maxAreaMm2: 1000, maxColors: null },
        },
      ],
      {},
    );
    assert.deepEqual(codes(ws), ['AREA_OVER_ZONE']);
  });

  it('цветность больше лимита зоны из каталога', () => {
    const ws = validateImprints(
      [
        {
          ...base,
          colorCount: 3,
          zone: { zoneName: 'на планке', maxWidthMm: null, maxHeightMm: null, maxAreaMm2: null, maxColors: 2 },
        },
      ],
      {},
    );
    assert.deepEqual(codes(ws), ['COLORS_OVER_ZONE']);
  });

  it('метод не подходит материалу', () => {
    const ws = validateImprints([{ ...base, methodCode: 'EMBROIDERY' }], { materialRu: 'металл' });
    assert.deepEqual(codes(ws), ['MATERIAL_MISMATCH']);
  });

  it('материал не указан — про материал молчим', () => {
    assert.deepEqual(validateImprints([{ ...base, methodCode: 'EMBROIDERY' }], {}), []);
  });

  it('две зоны перекрываются', () => {
    const ws = validateImprints(
      [
        { ...base, placement: place(0.5, 0.5, 0.3, 0.3) },
        { ...base, placement: place(0.55, 0.55, 0.3, 0.3) },
      ],
      {},
    );
    assert.deepEqual(codes(ws), ['ZONES_OVERLAP']);
  });

  it('две зоны рядом, но без пересечения — тишина', () => {
    const ws = validateImprints(
      [
        { ...base, placement: place(0.2, 0.2, 0.2, 0.2) },
        { ...base, placement: place(0.8, 0.8, 0.2, 0.2) },
      ],
      {},
    );
    assert.deepEqual(ws, []);
  });

  it('без sizeMm проверки размера пропускаются', () => {
    assert.deepEqual(validateImprints([{ ...base, sizeMm: undefined }], {}), []);
  });

  it('накапливает несколько предупреждений на одном блоке', () => {
    const ws = validateImprints(
      [{ ...base, methodCode: 'LASER_ENGRAVING', colorCount: 4, sizeMm: { w: 300, h: 300 } }],
      { materialRu: 'текстиль' },
    );
    assert.deepEqual(codes(ws), ['COLORS_OVER_METHOD', 'MATERIAL_MISMATCH', 'SIZE_OVER_METHOD']);
  });
});
