import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRng,
  seedFromString,
  seededShuffle,
  seededOffset,
} from './catalog-retrieval-seed.util';

describe('makeRng', () => {
  it('детерминирован: один seed → одна последовательность', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
  });
  it('разные seed → разные последовательности', () => {
    const a = makeRng(1)();
    const b = makeRng(2)();
    assert.notEqual(a, b);
  });
  it('значения в [0,1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `вне диапазона: ${v}`);
    }
  });
  it('seed 0 не вырождается в константу', () => {
    const r = makeRng(0);
    assert.notEqual(r(), r());
  });
});

describe('seedFromString', () => {
  it('стабилен для одного текста', () => {
    assert.equal(seedFromString('подарки IT'), seedFromString('подарки IT'));
  });
  it('различает тексты', () => {
    assert.notEqual(seedFromString('a'), seedFromString('b'));
  });
});

describe('seededShuffle', () => {
  it('один seed → одинаковый порядок, вход не мутируется', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = seededShuffle(src, makeRng(99));
    const s2 = seededShuffle(src, makeRng(99));
    assert.deepEqual(s1, s2);
    assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual([...s1].sort((a, b) => a - b), src); // те же элементы
  });
  it('разные seed → (обычно) разный порядок', () => {
    const src = Array.from({ length: 20 }, (_, i) => i);
    assert.notDeepEqual(seededShuffle(src, makeRng(1)), seededShuffle(src, makeRng(2)));
  });
});

describe('seededOffset', () => {
  it('count ≤ quota → 0', () => {
    assert.equal(seededOffset(10, 20, makeRng(1)), 0);
  });
  it('в пределах [0, count-quota) и детерминирован', () => {
    const o1 = seededOffset(1000, 100, makeRng(5));
    const o2 = seededOffset(1000, 100, makeRng(5));
    assert.equal(o1, o2);
    assert.ok(o1 >= 0 && o1 < 900);
  });
});
