import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMethodName, getImprintMethod, IMPRINT_METHODS } from './imprint-methods';

describe('normalizeMethodName — реальные строки из фидов', () => {
  it('oasis: гравировка CO2', () => {
    assert.equal(normalizeMethodName('Гравировка (CO2 лазер) (Без чернения)'), 'LASER_ENGRAVING');
  });
  it('oasis: шильд', () => {
    assert.equal(normalizeMethodName('Шильд спектрум'), 'METAL_PLATE');
  });
  it('oasis: тампопечать с цветностью', () => {
    assert.equal(normalizeMethodName('Тампопечать 4+0 цветные изделия'), 'PAD_PRINT');
  });
  it('midocean: шелкотрафаретная печать', () => {
    assert.equal(normalizeMethodName('Шелкотрафаретная печать'), 'SCREEN_PRINT_HARD');
  });
  it('midocean: цифровой термоперенос', () => {
    assert.equal(normalizeMethodName('Цифровой термоперенос 1'), 'DTF_TRANSFER');
  });
  it('art24: круговая гравировка', () => {
    assert.equal(normalizeMethodName('Гравировка Круговая - CO2'), 'LASER_ENGRAVING');
  });
  it('art24: оптоволоконный лазер', () => {
    assert.equal(normalizeMethodName('Гравировка-А3 (оптоволоконный лазер)'), 'LASER_ENGRAVING');
  });
  it('art24: УФ-Лак', () => {
    assert.equal(normalizeMethodName('УФ-Лак'), 'UV_PRINT');
  });
  it('вышивка', () => {
    assert.equal(normalizeMethodName('Вышивка 3D'), 'EMBROIDERY');
  });
  it('тиснение фольгой отличается от блинтового', () => {
    assert.equal(normalizeMethodName('Тиснение (Фольга)'), 'FOIL_STAMP');
    assert.equal(normalizeMethodName('Блинтовое тиснение'), 'BLIND_DEBOSS');
  });
  it('неизвестное → null, а не исключение', () => {
    assert.equal(normalizeMethodName('Космическая телепортация'), null);
    assert.equal(normalizeMethodName(''), null);
  });
});

describe('IMPRINT_METHODS — лимиты', () => {
  it('лазер монохромный', () => {
    const m = getImprintMethod('LASER_ENGRAVING');
    assert.equal(m.colorMode, 'mono');
    assert.equal(m.maxColors, 1);
  });
  it('УФ-печать полноцветная: maxColors = null', () => {
    assert.equal(getImprintMethod('UV_PRINT').maxColors, null);
  });
  it('тампопечать ≤ 4 цветов и 50×50 мм', () => {
    const m = getImprintMethod('PAD_PRINT');
    assert.equal(m.maxColors, 4);
    assert.equal(m.maxWidthMm, 50);
    assert.equal(m.maxHeightMm, 50);
  });
  it('у каждого метода непустая физика для промпта', () => {
    for (const code of Object.keys(IMPRINT_METHODS)) {
      const m = IMPRINT_METHODS[code as keyof typeof IMPRINT_METHODS];
      assert.ok(m.physicsEn.length > 20, `${code}: physicsEn слишком короткая`);
      assert.equal(m.code, code);
    }
  });
});
