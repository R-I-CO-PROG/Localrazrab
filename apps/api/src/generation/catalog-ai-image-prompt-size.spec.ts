import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCatalogSizeRulesForPrompt } from './catalog-ai-image-prompt';

describe('formatCatalogSizeRulesForPrompt', () => {
  it('строит правило масштаба с конкретными см', () => {
    const out = formatCatalogSizeRulesForPrompt([
      { name: 'Кружка керамическая', longestCm: 12, sizeClass: 'small' },
      { name: 'Рюкзак городской', longestCm: 45, sizeClass: 'large' },
    ]);
    assert.match(out, /12 cm/);
    assert.match(out, /45 cm/);
    assert.match(out, /PRODUCT SCALE/);
  });

  it('< 2 товаров с размером → пусто (останется общая фраза)', () => {
    assert.equal(formatCatalogSizeRulesForPrompt([{ name: 'X', longestCm: 12, sizeClass: 'small' }]), '');
    assert.equal(formatCatalogSizeRulesForPrompt([]), '');
    assert.equal(
      formatCatalogSizeRulesForPrompt([
        { name: 'A', longestCm: 0, sizeClass: 'medium' },
        { name: 'B', longestCm: 0, sizeClass: 'medium' },
      ]),
      '',
    );
  });

  it('товар без размера помечается «typical size», но правило строится если ≥2 с размером', () => {
    const out = formatCatalogSizeRulesForPrompt([
      { name: 'Кружка', longestCm: 12, sizeClass: 'small' },
      { name: 'Рюкзак', longestCm: 45, sizeClass: 'large' },
      { name: 'Загадка', longestCm: 0, sizeClass: 'medium' },
    ]);
    assert.match(out, /typical size/);
  });
});
