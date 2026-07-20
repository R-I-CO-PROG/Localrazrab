import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetBasedItemBounds,
  resolveProductCountBounds,
} from '../providers/llm/product-count-bounds.util';
import { isExclusiveBriefMode } from '../requests/named-positions.util';

describe('число предметов из бюджета', () => {
  it('дорогой набор → больше позиций', () => {
    // Философия budgetBasedItemBounds: выше бюджет → больше И дороже позиций,
    // а не 3 мелочи / не 12 копеечных дженериков. Банды: ≤10k → 3-4, 25k → 4-5,
    // 50k → 4-6, 100k+ → 6-8. Малый бюджет НЕ обязан давать 4+ позиции (3 на 1500₽ — норма).
    const b3000 = budgetBasedItemBounds(3000)!;
    assert.deepEqual(b3000, { min: 3, max: 4 }, `3000₽ → ${JSON.stringify(b3000)}`);
    const b25000 = budgetBasedItemBounds(25000)!;
    assert.ok(b25000.min >= 4 && b25000.max >= 5, `25000₽ → ${JSON.stringify(b25000)}`);
    const b100000 = budgetBasedItemBounds(100000)!;
    assert.ok(b100000.max >= 8, `100000₽ → ${JSON.stringify(b100000)}`);
    // Монотонность: больше бюджет — не меньше позиций.
    assert.ok(
      b25000.min >= b3000.min && b100000.max >= b25000.max,
      `монотонность нарушена: ${JSON.stringify([b3000, b25000, b100000])}`,
    );
  });

  it('нет бюджета → null', () => {
    assert.equal(budgetBasedItemBounds(null), null);
    assert.equal(budgetBasedItemBounds(0), null);
  });

  it('resolveProductCountBounds использует бюджет, если число не задано', () => {
    // Без явного числа в тексте/полях количество берётся из бюджета (делегирует
    // budgetBasedItemBounds). Проверяем именно это делегирование, а не абсолютный порог.
    const bounds = resolveProductCountBounds({ userPrompt: 'Welcome Pack', budgetPerSet: 25000 });
    const byBudget = budgetBasedItemBounds(25000)!;
    assert.equal(bounds.min, byBudget.min, `бюджет 25000₽ → min ${byBudget.min}, получено ${bounds.min}`);
    assert.equal(bounds.max, byBudget.max, `бюджет 25000₽ → max ${byBudget.max}, получено ${bounds.max}`);
  });

  it('явное число в брифе приоритетнее бюджета', () => {
    const bounds = resolveProductCountBounds({
      userPrompt: 'Набор из 3 предметов',
      budgetPerSet: 9000,
    });
    assert.equal(bounds.min, 3);
    assert.equal(bounds.max, 3);
  });

  it('явные поля запроса приоритетнее бюджета', () => {
    const bounds = resolveProductCountBounds({
      userPrompt: 'Welcome Pack',
      budgetPerSet: 9000,
      minProductsPerSet: 5,
      maxProductsPerSet: 5,
    });
    assert.equal(bounds.min, 5);
    assert.equal(bounds.max, 5);
  });
});

describe('эксклюзив-режим (только названные позиции)', () => {
  const named = ['decanter', 'flask'];

  it('«можно / можете предложить» — НЕ эксклюзив', () => {
    assert.equal(isExclusiveBriefMode('Welcome Pack, можно: ежедневник, ручка', named), false);
    assert.equal(isExclusiveBriefMode('Можете предложить термос и плед', named), false);
  });

  it('«только эти / строго / из тех позиций» — эксклюзив', () => {
    assert.equal(isExclusiveBriefMode('Нужны только эти позиции: декантер, штоф', named), true);
    assert.equal(isExclusiveBriefMode('Строго по списку: декантер и штоф', named), true);
    assert.equal(isExclusiveBriefMode('Из тех позиций что я назову: декантер, штоф', named), true);
  });

  it('без названных типов эксклюзив невозможен', () => {
    assert.equal(isExclusiveBriefMode('Только эти позиции', []), false);
  });
});
