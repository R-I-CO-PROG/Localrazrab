import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBriefLocally, parseExplicitTirage } from './parse-brief.util';
import { splitAllowedItemsMixed } from './named-positions.util';
import { resolveMandatoryTypesForBrief } from './mandatory-types.util';

describe('parseExplicitTirage — только сильные сигналы тиража', () => {
  it('«тираж 30» / «30 наборов» / «50 штук» → число', () => {
    assert.equal(parseExplicitTirage('тираж 30'), 30);
    assert.equal(parseExplicitTirage('нужно 30 наборов для команды'), 30);
    assert.equal(parseExplicitTirage('50 штук'), 50);
    assert.equal(parseExplicitTirage('в количестве 200 экземпляров'), 200);
  });

  it('слабый инференс по аудитории НЕ считается явным тиражом', () => {
    assert.equal(parseExplicitTirage('подарки для 100 сотрудников'), null);
    assert.equal(parseExplicitTirage('на 100 человек'), null);
    assert.equal(parseExplicitTirage('бюджет 3000, для команды'), null);
  });

  it('«2 товара в наборе» — это размер набора, НЕ тираж', () => {
    assert.equal(parseExplicitTirage('1-2 товара в наборе'), null);
    assert.equal(parseExplicitTirage('2 товара в наборе, бюджет 3000'), null);
  });
});

describe('parseBriefLocally named positions', () => {
  it('parses named positions from brief list', () => {
    const brief =
      'Корпоративный набор для бара. Из тех позиций что я назову: Декантер, Ступка, Штоф, Шейкер, Проектор, Welcome Pack. Бюджет 15000 руб.';
    const parsed = parseBriefLocally(brief);

    assert.ok(parsed.namedItems?.includes('Декантер') || parsed.namedItems?.includes('декантер'));
    assert.ok(parsed.namedItems?.some((n) => /штоф/i.test(n)));
    assert.ok(parsed.namedItems?.some((n) => /шейкер/i.test(n)));
    assert.ok(parsed.updatedFields.includes('namedItems'));
  });

  it('keeps category buckets separate from named items in allowedItems', () => {
    const split = splitAllowedItemsMixed(['Текстиль', 'Декантер', 'Кружки']);
    assert.ok(split.categories.includes('Текстиль'));
    assert.ok(split.categories.includes('Кружки'));
    assert.ok(split.namedItems.includes('Декантер'));
  });

  it('does not strip named items in finalizeParsedBrief', () => {
    const brief = 'Нужны только: декантер, штоф, шейкер';
    const parsed = parseBriefLocally(brief);
    assert.ok((parsed.namedItems?.length ?? 0) >= 2);
    assert.ok(!((parsed.allowedItems as string[] | undefined) ?? []).includes('декантер'));
  });
});

describe('parseBriefLocally — именованный товар «повербанк»', () => {
  const brief =
    'Жёлтые повербанки, ёмкость 10000, покрытие софт тач, тираж 155 штук, бюджет от 500 рублей до 2000';

  it('диапазон «от 500 рублей до 2000» берёт верхнюю границу (2000)', () => {
    const parsed = parseBriefLocally(brief);
    assert.equal(parsed.budgetMax, 2000);
  });

  it('«повербанки» → Электроника, а НЕ банковская канцелярия', () => {
    const parsed = parseBriefLocally(brief);
    const allowed = (parsed.allowedItems ?? []) as string[];
    assert.ok(allowed.includes('Электроника'), `allowed=${allowed.join(',')}`);
    assert.ok(!allowed.includes('Ежедневники и блокноты'), `allowed=${allowed.join(',')}`);
    assert.ok(!allowed.includes('Ручки'), `allowed=${allowed.join(',')}`);
  });

  it('«повербанк» распознаётся как обязательный тип powerbank', () => {
    const types = resolveMandatoryTypesForBrief(brief, []);
    assert.ok(types.includes('powerbank'), `types=${types.join(',')}`);
  });
});
