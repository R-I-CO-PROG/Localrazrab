import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scorePriceCurve } from './catalog-shortlist.util';

// Фикс 1: асимметричная ценовая кривая. Бюджет набора 3000₽.
describe('Фикс 1: ценовая кривая (цена=ценность)', () => {
  const B = 3000;
  const ei = 5; // aim for full set

  it('в НЕПОЛНОМ наборе (3 поз.) качество 1500₽ обгоняет дешёвку 600₽ (раньше наоборот)', () => {
    // цена-на-предмет для 3 позиций при 3000₽ = 1000₽ → 1500 ближе к пику, чем 600
    assert.ok(
      scorePriceCurve(1500, B, 3, false) > scorePriceCurve(600, B, 3, false),
      `1500=${scorePriceCurve(1500, B, 3, false)} vs 600=${scorePriceCurve(600, B, 3, false)}`,
    );
  });

  it('дорогое качество НЕ обнуляется справа (1500₽ заметно в плюсе)', () => {
    assert.ok(scorePriceCurve(1500, B, ei, false) >= 6, `1500₽ = ${scorePriceCurve(1500, B, ei, false)}`);
    assert.ok(scorePriceCurve(2600, B, ei, false) >= 4, `2600₽ = ${scorePriceCurve(2600, B, ei, false)}`);
  });

  it('несерьёзный дешёвый филлер (171/304₽) уходит в минус/около-ноль', () => {
    assert.ok(scorePriceCurve(171, B, ei, false) < 0, `171₽ = ${scorePriceCurve(171, B, ei, false)}`);
    assert.ok(scorePriceCurve(304, B, ei, false) <= 1, `304₽ = ${scorePriceCurve(304, B, ei, false)}`);
  });

  it('junk скорит СИЛЬНО ниже качества', () => {
    assert.ok(scorePriceCurve(750, B, ei, false) - scorePriceCurve(171, B, ei, false) >= 12);
    assert.ok(scorePriceCurve(750, B, ei, false) - scorePriceCurve(304, B, ei, false) >= 8);
  });

  it('пик кривой сдвигается с числом позиций (3 поз. → пик дороже, чем 5 поз.)', () => {
    // при 3 позициях цена-на-предмет выше → пик кривой у более дорогого товара
    const peak3 = scorePriceCurve(1000, B, 3, false); // 1/3 * 3000 = 1000
    const at1000of5 = scorePriceCurve(1000, B, 5, false); // 1000 далеко справа от 600
    assert.ok(peak3 > at1000of5, `1000₽: 3поз=${peak3} должно быть > 5поз=${at1000of5}`);
  });

  it('малый бюджет (врачи 800₽) — value-floor НЕ выкашивает 400₽ позицию', () => {
    // 400₽ при 800₽/4поз (target 200) — выше floor, должен быть в плюсе
    assert.ok(scorePriceCurve(400, 800, 4, false) > 3, `400₽@800 = ${scorePriceCurve(400, 800, 4, false)}`);
    // и совсем дешёвая 100₽ штрафуется лишь мягко (не −16)
    assert.ok(scorePriceCurve(100, 800, 4, false) > -10, `100₽@800 = ${scorePriceCurve(100, 800, 4, false)}`);
  });

  it('модуль ценового сигнала строго меньше variety-cap −150', () => {
    for (const price of [50, 171, 304, 600, 1500, 3000, 5000]) {
      assert.ok(Math.abs(scorePriceCurve(price, B, ei, false)) < 150);
    }
  });
});
