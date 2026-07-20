import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { trimItemsPreservingMust, targetSetSize } from './creative-set-size.util';

const must = (n: string) => ({ productType: n, priority: 'must' as const });
const nice = (n: string) => ({ productType: n, priority: 'nice' as const });

describe('creative set-size trim: must-позиции неприкосновенны', () => {
  it('НЕ выбрасывает must, стоящий ПОСЛЕ nice (порядок LLM не гарантирует must-первыми)', () => {
    // index=1 → паттерн 3. Раньше slice(0,3) оставил бы [n1,n2,n3] и потерял ОБА must.
    const items = [nice('n1'), nice('n2'), nice('n3'), must('m1'), must('m2')];
    const out = trimItemsPreservingMust(items, 1);
    assert.equal(out.filter((i) => i.priority === 'must').length, 2, `must потерян: ${JSON.stringify(out)}`);
    assert.ok(out.some((i) => i.productType === 'm1') && out.some((i) => i.productType === 'm2'));
  });

  it('режет только nice-хвост и сохраняет исходный порядок', () => {
    const items = [must('m1'), nice('n1'), nice('n2'), nice('n3'), nice('n4')];
    const out = trimItemsPreservingMust(items, 1); // паттерн 3
    assert.equal(out.length, 3);
    assert.deepEqual(out.map((i) => i.productType), ['m1', 'n1', 'n2']);
  });

  it('никогда не опускается ниже числа must (даже если паттерн меньше)', () => {
    const items = [must('m1'), must('m2'), must('m3'), must('m4'), nice('n1')];
    const out = trimItemsPreservingMust(items, 1); // паттерн 3, но must=4
    assert.equal(out.length, 4, `нельзя резать ниже must-count: ${JSON.stringify(out)}`);
    assert.equal(out.filter((i) => i.priority === 'must').length, 4);
  });

  it('наборы ≤3 позиций не трогаются', () => {
    const items = [nice('n1'), must('m1'), nice('n2')];
    assert.equal(trimItemsPreservingMust(items, 1), items);
  });

  it('targetSetSize: min 3, не ниже must, не выше наличного', () => {
    assert.equal(targetSetSize(5, 0, 1), 3); // паттерн 3
    assert.equal(targetSetSize(5, 4, 1), 4); // must поднимает
    assert.equal(targetSetSize(2, 0, 1), 2); // не выше наличного
  });
});
