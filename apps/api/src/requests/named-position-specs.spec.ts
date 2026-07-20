import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNamedPositionSpecsForBrief } from './named-positions.util';

describe('resolveNamedPositionSpecsForBrief', () => {
  it('позиция из списка с атрибутом и цветом через запятую («…, синий»)', () => {
    const specs = resolveNamedPositionSpecsForBrief(
      'В набор нужны: пауэрбанк на 5000 мАч, синий, кружка 300 мл',
    );
    assert.ok(specs.powerbank, `нет powerbank: ${JSON.stringify(Object.keys(specs))}`);
    assert.deepEqual(
      specs.powerbank.attributes.map((a) => [a.kind, a.value]),
      [['capacity_mah', 5000]],
    );
    assert.deepEqual(specs.powerbank.colors, ['синий']);
    assert.ok(specs.mug, `нет mug: ${JSON.stringify(Object.keys(specs))}`);
    assert.deepEqual(
      specs.mug.attributes.map((a) => [a.kind, a.value]),
      [['volume_ml', 300]],
    );
  });

  it('цвет внутри того же фрагмента («синего цвета»)', () => {
    const specs = resolveNamedPositionSpecsForBrief(
      'нужен пауэрбанк на 5000 мАч синего цвета',
    );
    assert.deepEqual(specs.powerbank?.colors, ['синий']);
    assert.equal(specs.powerbank?.attributes[0]?.value, 5000);
  });

  it('позиция вне списочных триггеров — окно вокруг упоминания типа', () => {
    const specs = resolveNamedPositionSpecsForBrief(
      'Хотим добавить в подарок повербанк 10000 mAh чёрный. Бюджет 3000 руб.',
    );
    assert.equal(specs.powerbank?.attributes[0]?.value, 10000);
    assert.deepEqual(specs.powerbank?.colors, ['чёрный']);
  });

  it('окно не захватывает атрибуты соседней позиции в том же предложении', () => {
    const specs = resolveNamedPositionSpecsForBrief(
      'Обязательно повербанк 10000 mAh и бутылка 400 мл',
    );
    assert.deepEqual(
      specs.powerbank?.attributes.map((a) => [a.kind, a.value]),
      [['capacity_mah', 10000]],
    );
    assert.deepEqual(
      specs.bottle?.attributes.map((a) => [a.kind, a.value]),
      [['volume_ml', 400]],
    );
  });

  it('позиция без атрибутов — спека пустая, но не ломается', () => {
    const specs = resolveNamedPositionSpecsForBrief('нужен повербанк для команды');
    if (specs.powerbank) {
      assert.equal(specs.powerbank.attributes.length, 0);
      assert.equal(specs.powerbank.colors.length, 0);
    }
  });

  it('бюджет и тираж не превращаются в атрибуты позиции', () => {
    const specs = resolveNamedPositionSpecsForBrief(
      'нужен повербанк, тираж 300 шт, бюджет до 5000 рублей',
    );
    assert.equal(specs.powerbank?.attributes.length ?? 0, 0);
  });
});
