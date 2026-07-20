import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosine, giftIntentForBrief } from './catalog-embeddings.util';

describe('embeddings util (детерминированные части)', () => {
  it('cosine: одинаковые векторы = 1, ортогональные = 0', () => {
    assert.ok(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
    assert.equal(cosine([1, 0], [0, 1]), 0);
    assert.equal(cosine([], [1]), 0);
    assert.equal(cosine([1, 2], [1, 2, 3]), 0); // разная длина
  });
  it('giftIntentForBrief: врач/продажник дают точный интент', () => {
    const doc = giftIntentForBrief('подарки врачам на день медицинского работника');
    assert.ok(doc && /плед|термокружк|забот/i.test(doc.positive) && /фляжк|органайзер для машин|багажник|автомоб/i.test(doc.negative));
    const sales = giftIntentForBrief('онбординг менеджеров по продажам');
    assert.ok(sales && /визитниц|папк|переговор/i.test(sales.positive) && /багажник|косметичк|обуви/i.test(sales.negative));
  });
  it('generic fallback: ЛЮБОЙ содержательный бриф даёт интент из своего текста', () => {
    const g = giftIntentForBrief('подарки бухгалтерам к профессиональному празднику');
    assert.ok(g && /бухгалтер/i.test(g.positive), 'generic использует текст брифа');
    // сезон-осведомлённость: НГ → в negative летние/пляжные
    const ny = giftIntentForBrief('новогодние подарки клиентам');
    assert.ok(ny && /летн|пляжн/i.test(ny.negative), 'НГ generic исключает лето');
    // слишком короткий/пустой — null
    assert.equal(giftIntentForBrief('  '), null);
  });
});
