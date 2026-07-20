import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from './catalog-brief-relevance.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее', price = 500): CatalogProduct {
  return {
    id: 'x', name, category, subcategory: null, description: name, price,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}
const score = (name: string, brief: string) =>
  scoreBriefRelevanceWithContext(p(name), buildBriefRelevanceContext(brief, []));

const NOVELTY = [
  'Набор отверток 10-в-1, серебристый',
  'Фонарик с фокусировкой «Дарт», 350 Лм, черный',
  'Автомобильный держатель для телефона "Allo"',
  'Косметическое зеркало Laverne, белый',
  'Коврик Cobra для фитнеса и йоги, черный',
  'ПВХ Коврик для йоги Asana, серый',
  'Спортивный шейкер из нержавеющей стали Top Up, 500 мл',
];

describe('context-gated novelty: режем гаджеты вне контекста', () => {
  beforeEach(() => clearProductTypeCache());

  it('врачам: все novelty-гаджеты получают жёсткий reject (< junkFloor)', () => {
    for (const n of NOVELTY) {
      assert.ok(score(n, 'подарки врачам на день медицинского работника') <= -70, `не зарезан: ${n}`);
    }
  });

  it('менеджерам по продажам: отвёртки/зеркало/фонарик зарезаны', () => {
    const b = 'наборы для онбординга менеджеров по продажам';
    assert.ok(score('Набор отверток 10-в-1', b) <= -70, 'отвёртки');
    assert.ok(score('Косметическое зеркало Laverne', b) <= -70, 'зеркало');
    assert.ok(score('Фонарик «Дарт», 350 Лм', b) <= -70, 'фонарик');
  });
});

describe('context-gated novelty: в СВОЁМ контексте — НЕ режем', () => {
  beforeEach(() => clearProductTypeCache());

  it('коврик для йоги в фитнес/спорт-брифе — не зарезан', () => {
    assert.ok(score('Коврик Cobra для фитнеса и йоги', 'фитнес-наборы для wellness-программы сотрудников') > -70);
    assert.ok(score('ПВХ Коврик для йоги Asana', 'спортивный корпоратив, активный отдых') > -70);
  });
  it('фонарик в пикник/outdoor-брифе — не зарезан', () => {
    assert.ok(score('Фонарик «Дарт», 350 Лм', 'наборы для пикника и активного отдыха компании') > -70);
  });
  it('косметическое зеркало на 8 марта — не зарезано', () => {
    assert.ok(score('Косметическое зеркало Laverne', 'подарки на 8 марта женщинам-коллегам') > -70);
  });
  it('автодержатель для автодилера — не зарезан', () => {
    assert.ok(score('Автомобильный держатель для телефона "Allo"', 'подарки клиентам автодилерского центра') > -70);
  });
  it('шейкер в спорт-брифе — не зарезан', () => {
    assert.ok(score('Спортивный шейкер Top Up', 'фитнес-наборы для сотрудников') > -70);
  });
});

describe('context-gated novelty: обычные товары НЕ задеты', () => {
  beforeEach(() => clearProductTypeCache());
  it('ручка/блокнот/повербанк/термокружка врачам — не зарезаны', () => {
    const b = 'подарки врачам на день медицинского работника';
    for (const n of ['Ручка металлическая Parker', 'Блокнот А5 премиум', 'Пауэрбанк 10000 mAh', 'Термокружка стальная 350 мл']) {
      assert.ok(score(n, b) > -70, `ложно зарезан: ${n}`);
    }
  });
});
