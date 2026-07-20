import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import { scoreBriefRelevance } from '../providers/llm/catalog-brief-relevance.util';
import { clearProductTypeCache } from './product-taxonomy';

function mk(name: string, description = '', price = 800): CatalogProduct {
  return {
    id: name,
    name,
    description,
    category: 'Подарки',
    subcategory: null,
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/p.jpg',
    price,
    colors: [],
  };
}

describe('scoreBriefRelevance — декларативные темы', () => {
  beforeEach(() => clearProductTypeCache());

  it('летний бриф жёстко отсекает новогодний декор', () => {
    const brief = 'Летний фестиваль на открытом воздухе';
    assert.ok(scoreBriefRelevance(mk('Ёлочная игрушка', 'новогодний шар'), brief) <= -150);
  });

  it('tech-бриф отсекает подарочные наборы и поднимает гаджеты', () => {
    const brief = 'Подарки для разработчиков на IT-конференции';
    assert.ok(scoreBriefRelevance(mk('Подарочный набор Hygge', 'плед свеча'), brief) <= -100);
    assert.ok(scoreBriefRelevance(mk('Powerbank 10000', 'powerbank зарядка'), brief) > 0);
  });

  it('уютный зимний бриф поднимает плед и отсекает фитнес', () => {
    const brief = 'Уютный зимний набор для арендаторов, тепло и комфорт';
    assert.ok(scoreBriefRelevance(mk('Плед флисовый', 'плед тёплый'), brief) > 0);
    assert.ok(scoreBriefRelevance(mk('Набор для фитнеса', 'фитнес резинка эспандер'), brief) <= -150);
  });

  it('премиальный бриф отсекает дешёвые стикеры/брелоки', () => {
    const brief = 'VIP-подарки инвесторам, премиум';
    assert.ok(scoreBriefRelevance(mk('Брелок пластик', 'брелок', 40), brief) <= -100);
  });

  it('нейтральный бриф не отсекает обычный товар', () => {
    const brief = 'Корпоративные подарки сотрудникам';
    assert.ok(scoreBriefRelevance(mk('Кружка керамика', 'кружка'), brief) > -50);
  });
});
