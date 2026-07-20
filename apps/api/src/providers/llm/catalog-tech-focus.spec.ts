import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBriefRelevanceContext,
  scoreBriefRelevanceWithContext,
} from './catalog-brief-relevance.util';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: category, description: '', price: 1500,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('«технологичное» → техника выигрывает у офис-staple (задача 2)', () => {
  const ctx = buildBriefRelevanceContext('нужно что-то технологичное настольное для IT-сотрудников', []);

  it('techFocus флаг активен на «технологичное»', () => {
    assert.equal(ctx.flags.techFocus, true);
    assert.equal(ctx.flags.deskTech, true);
  });

  it('гаджеты (лампа/хаб/метеостанция) ранжируются ВЫШЕ рюкзака/блокнота/термокружки', () => {
    const gadget = Math.min(
      scoreBriefRelevanceWithContext(p('Настольная лампа с беспроводной зарядкой', 'Электроника'), ctx),
      scoreBriefRelevanceWithContext(p('USB-хаб на 4 порта Type-C', 'Электроника'), ctx),
      scoreBriefRelevanceWithContext(p('Метеостанция настольная', 'Электроника'), ctx),
    );
    const staple = Math.max(
      scoreBriefRelevanceWithContext(p('Рюкзак для ноутбука', 'Сумки и рюкзаки'), ctx),
      scoreBriefRelevanceWithContext(p('Ежедневник А5', 'Ежедневники'), ctx),
      scoreBriefRelevanceWithContext(p('Термокружка стальная', 'Термосы'), ctx),
    );
    assert.ok(gadget > staple + 20, `gadget=${gadget} staple=${staple}`);
  });

  it('на НЕ-технологичном брифе штрафа нет (рюкзак не режется)', () => {
    const office = buildBriefRelevanceContext('подарки менеджерам по продажам, онбординг', []);
    assert.equal(office.flags.techFocus, false);
    // рюкзак на онбординге — норм, не должен получать техфокус-штраф
    assert.ok(scoreBriefRelevanceWithContext(p('Рюкзак городской', 'Сумки и рюкзаки'), office) >= 0);
  });
});
