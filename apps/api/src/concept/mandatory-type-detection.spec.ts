import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMandatoryConceptTypesFromBrief,
} from '../providers/llm/concept-diversity.util';

describe('detectMandatoryConceptTypesFromBrief — ложные срабатывания', () => {
  it('НЕ делает «часы» обязательными из-за слова «участников»', () => {
    const brief = 'Корпоративные подарки для участников конференции, бюджет 5000 ₽';
    const types = detectMandatoryConceptTypesFromBrief(brief);
    assert.ok(!types.includes('watch'), `watch не должен быть mandatory, получено: [${types.join(', ')}]`);
  });

  it('НЕ делает «часы» обязательными из-за «сейчас / часто / в течение часов»', () => {
    for (const brief of [
      'Нужен набор, который сейчас актуален для клиентов',
      'Подарки, которые часто дарят партнёрам',
      'Доставка в течение 48 часов',
    ]) {
      const types = detectMandatoryConceptTypesFromBrief(brief);
      assert.ok(!types.includes('watch'), `"${brief}" → watch не ожидался: [${types.join(', ')}]`);
    }
  });

  it('делает «часы» обязательными при явном запросе', () => {
    for (const brief of [
      'В набор обязательно нужны часы наручные',
      'Хотим умные часы и блокнот',
    ]) {
      const types = detectMandatoryConceptTypesFromBrief(brief);
      assert.ok(types.includes('watch'), `"${brief}" → ожидался watch: [${types.join(', ')}]`);
    }
  });

  it('НЕ делает «кружку» обязательной из-за «окружение / окружающей среды»', () => {
    const brief = 'Эко-набор, забота об окружающей среде и комфортном окружении в офисе';
    const types = detectMandatoryConceptTypesFromBrief(brief);
    assert.ok(!types.includes('mug'), `mug не должен быть mandatory, получено: [${types.join(', ')}]`);
  });

  it('распознаёт названный товар БЕЗ префикса «нужно/хотим» (recall)', () => {
    const cases: Array<[string, string]> = [
      ['блокнот с логотипом компании', 'notebook'],
      ['в набор положите бутылку для воды', 'bottle'],
      ['добавьте рюкзак и ежедневник', 'backpack'],
      ['хороший зонт в подарок', 'umbrella'],
      ['шоппер из хлопка', 'shopper'],
    ];
    for (const [brief, slug] of cases) {
      const types = detectMandatoryConceptTypesFromBrief(brief);
      assert.ok(types.includes(slug), `"${brief}" → ожидался ${slug}: [${types.join(', ')}]`);
    }
  });

  it('делает «кружку» обязательной при явном запросе', () => {
    for (const brief of [
      'Нужна кружка с логотипом',
      'В набор: кружка и ручка',
      'Закупка кружек для команды',
    ]) {
      const types = detectMandatoryConceptTypesFromBrief(brief);
      assert.ok(types.includes('mug'), `"${brief}" → ожидался mug: [${types.join(', ')}]`);
    }
  });
});
