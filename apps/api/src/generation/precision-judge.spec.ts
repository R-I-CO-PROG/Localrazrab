import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJudgeResponse, judgeVerdictWarnings } from './precision-judge';

describe('parseJudgeResponse', () => {
  it('чистый JSON', () => {
    const v = parseJudgeResponse('{"productUnchanged":true,"imprintPlaced":true,"looksPhysical":false,"notes":["плоско"]}');
    assert.deepEqual(v, { productUnchanged: true, imprintPlaced: true, looksPhysical: false, notes: ['плоско'] });
  });

  it('JSON внутри markdown-блока', () => {
    const v = parseJudgeResponse('```json\n{"productUnchanged":false,"imprintPlaced":true,"looksPhysical":true,"notes":[]}\n```');
    assert.equal(v!.productUnchanged, false);
  });

  it('мусор → null, а не исключение', () => {
    assert.equal(parseJudgeResponse('извините, не могу'), null);
    assert.equal(parseJudgeResponse(''), null);
  });

  it('отсутствующие поля получают безопасные значения', () => {
    const v = parseJudgeResponse('{"imprintPlaced":false}');
    assert.deepEqual(v, { productUnchanged: true, imprintPlaced: false, looksPhysical: true, notes: [] });
  });
});

describe('judgeVerdictWarnings', () => {
  it('всё хорошо — предупреждений нет', () => {
    assert.deepEqual(
      judgeVerdictWarnings({ productUnchanged: true, imprintPlaced: true, looksPhysical: true, notes: [] }),
      [],
    );
  });

  it('товар изменился', () => {
    const w = judgeVerdictWarnings({ productUnchanged: false, imprintPlaced: true, looksPhysical: true, notes: [] });
    assert.equal(w.length, 1);
    assert.match(w[0], /товар/i);
  });

  it('наклейка вместо нанесения', () => {
    const w = judgeVerdictWarnings({ productUnchanged: true, imprintPlaced: true, looksPhysical: false, notes: [] });
    assert.match(w[0], /наклейк/i);
  });

  it('заметки модели добавляются к предупреждениям', () => {
    const w = judgeVerdictWarnings({ productUnchanged: true, imprintPlaced: false, looksPhysical: true, notes: ['лого не видно'] });
    assert.equal(w.length, 2);
    assert.ok(w.includes('лого не видно'));
  });
});
