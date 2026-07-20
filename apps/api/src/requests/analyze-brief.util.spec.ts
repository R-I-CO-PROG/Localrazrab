import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBrief } from './analyze-brief.util';

describe('analyzeBrief', () => {
  it('returns BriefParameters with named items and directed mode', () => {
    const brief =
      'VIP bar set. Позиции: Декантер, Ступка, Штоф, Шейкер, Проектор. Бюджет 12000-15000 руб на набор.';
    const result = analyzeBrief(brief, {
      uiAllowedItems: ['Посуда'],
    });

    assert.equal(result.directedMode?.value, true);
    assert.ok(result.namedItems?.value?.some((n) => /декантер/i.test(n)));
    assert.ok(result.mandatoryTypes?.value?.includes('decanter'));
    assert.ok(result.mandatoryTypes?.value?.includes('projector'));
    assert.ok(result.allowedItems?.value?.includes('Посуда'));
    assert.ok((result.budgetMin?.value ?? 0) > 0);
    assert.equal(result.sources.directedMode, 'reconciled');
  });

  it('merges UI allowed categories without losing named positions', () => {
    const brief = 'Набор с декантером и штофом';
    const result = analyzeBrief(brief, {
      uiAllowedItems: ['Электроника', 'Проектор'],
    });

    assert.ok(result.allowedItems?.value?.includes('Электроника'));
    assert.ok(result.namedItems?.value?.some((n) => /декантер/i.test(n)));
    assert.ok(result.namedItems?.value?.some((n) => /штоф/i.test(n)));
  });
});
