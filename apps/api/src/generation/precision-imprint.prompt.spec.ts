import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrecisionImprintPrompt, PRECISION_REF_PREAMBLES } from './precision-imprint.prompt';

const base = {
  outputMode: 'edit' as const,
  productNameRu: 'Термокружка Corvus',
  materialRu: 'металл',
  imprints: [
    {
      methodCode: 'LASER_ENGRAVING' as const,
      colorCount: 1,
      sizeMm: { w: 40, h: 12 },
      zoneNameRu: 'на корпусе',
      contentDescription: 'client logo',
    },
  ],
};

describe('buildPrecisionImprintPrompt', () => {
  it('включает физику выбранного метода', () => {
    const { prompt } = buildPrecisionImprintPrompt(base);
    assert.match(prompt, /recessed mark burned into the material/i);
  });

  it('называет метод, зону и размер в мм', () => {
    const { prompt } = buildPrecisionImprintPrompt(base);
    assert.match(prompt, /40×12 mm/);
    assert.match(prompt, /на корпусе/);
  });

  it('без sizeMm блок с миллиметрами исчезает целиком', () => {
    const { prompt } = buildPrecisionImprintPrompt({
      ...base,
      imprints: [{ ...base.imprints[0], sizeMm: undefined }],
    });
    assert.doesNotMatch(prompt, /mm\b/);
  });

  it('режим edit требует сохранить кадр', () => {
    const { prompt } = buildPrecisionImprintPrompt(base);
    assert.match(prompt, /do not change the background/i);
    assert.match(prompt, /identical camera angle/i);
  });

  it('режим studio разрешает заменить фон, но не товар', () => {
    const { prompt } = buildPrecisionImprintPrompt({ ...base, outputMode: 'studio' });
    assert.match(prompt, /studio/i);
    assert.doesNotMatch(prompt, /do not change the background/i);
    assert.match(prompt, /same product/i);
  });

  it('negative-промпт запрещает плоскую наклейку', () => {
    const { negativePrompt } = buildPrecisionImprintPrompt(base);
    assert.match(negativePrompt, /flat pasted logo overlay/i);
    assert.match(negativePrompt, /sticker/i);
  });

  it('монохромный метод объявляет одноцветность', () => {
    const { prompt } = buildPrecisionImprintPrompt(base);
    assert.match(prompt, /single tone/i);
  });

  it('несколько нанесений нумеруются', () => {
    const { prompt } = buildPrecisionImprintPrompt({
      ...base,
      imprints: [
        base.imprints[0],
        { methodCode: 'PAD_PRINT' as const, colorCount: 2, contentDescription: 'website address' },
      ],
    });
    assert.match(prompt, /Imprint 1/);
    assert.match(prompt, /Imprint 2/);
    assert.match(prompt, /exactly 2 imprints/i);
  });

  it('преамбулы референсов различают роли', () => {
    assert.match(PRECISION_REF_PREAMBLES.draft, /positioning guide/i);
    assert.match(PRECISION_REF_PREAMBLES.draft, /not the desired appearance/i);
    assert.match(PRECISION_REF_PREAMBLES.source, /preserve/i);
    assert.match(PRECISION_REF_PREAMBLES.art, /exact/i);
  });

  it('два нанесения с одинаковым contentDescription: negative не запрещает дубликаты, positive нумерует оба', () => {
    const { prompt, negativePrompt } = buildPrecisionImprintPrompt({
      ...base,
      imprints: [
        { ...base.imprints[0], zoneNameRu: 'спереди' },
        { methodCode: 'PAD_PRINT' as const, colorCount: 1, contentDescription: 'client logo', zoneNameRu: 'сзади' },
      ],
    });
    assert.doesNotMatch(negativePrompt, /duplicate logo copies/i);
    assert.match(prompt, /Imprint 1/);
    assert.match(prompt, /Imprint 2/);
  });

  it('два нанесения с разным contentDescription: negative по-прежнему запрещает дубликаты', () => {
    const { negativePrompt } = buildPrecisionImprintPrompt({
      ...base,
      imprints: [
        base.imprints[0],
        { methodCode: 'PAD_PRINT' as const, colorCount: 1, contentDescription: 'the text "ACME"' },
      ],
    });
    assert.match(negativePrompt, /duplicate logo copies/i);
  });

  it('одно нанесение: negative по-прежнему запрещает дубликаты', () => {
    const { negativePrompt } = buildPrecisionImprintPrompt(base);
    assert.match(negativePrompt, /duplicate logo copies/i);
  });
});
