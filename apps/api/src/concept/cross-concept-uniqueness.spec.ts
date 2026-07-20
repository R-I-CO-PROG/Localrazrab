import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Concept } from '../agents/contracts';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import {
  enforceGlobalConceptUniqueness,
  seedVariantKeysFromProductIds,
} from '../providers/llm/cross-concept-uniqueness.util';
import { productVariantKey } from '../providers/llm/catalog-variant.util';

function p(id: string, name: string, price: number): CatalogProduct {
  return {
    id,
    name,
    category: 'Подарки',
    subcategory: null,
    description: name,
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/x.jpg',
    price,
    stockAvailable: 100,
    colors: [],
  };
}

describe('cross-concept uniqueness', () => {
  it('seedVariantKeysFromProductIds resolves variant keys from catalog', () => {
    const catalog = new Map([
      ['a', p('a', 'Блокнот Prime', 1200)],
      ['b', p('b', 'Блокнот Prime, синий', 1250)],
    ]);
    // База и цветовой вариант делят ОДИН variant-key — дедуп между наборами
    // схлопывает их в одну «модель» (это ядро variant-дедупа).
    const vkA = productVariantKey(catalog.get('a')!);
    const vkB = productVariantKey(catalog.get('b')!);
    assert.equal(vkA, vkB, `a/b должны делить variant-key: ${vkA} vs ${vkB}`);

    // Сид блокировки содержит общий variant-key. Он также подмешивает line-keys
    // линейки (их проверяет isVariantBlocked против blockedVariants), поэтому размер
    // множества не обязан быть 1 — важно, что a и b не дают ДВА разных variant-key.
    const keys = seedVariantKeysFromProductIds(['a', 'b'], catalog);
    assert.ok(keys.has(vkA), 'сид должен содержать общий variant-key');
    const distinctVariantKeys = new Set(['a', 'b'].map((id) => productVariantKey(catalog.get(id)!)));
    assert.equal(distinctVariantKeys.size, 1, 'a и b не должны давать два разных variant-key');
  });

  it('enforceGlobalConceptUniqueness removes duplicate SKU across concepts', () => {
    const charger = p('chg-1', 'Автомобильное беспроводное зарядное устройство', 2500);
    const pen = p('pen-1', 'Ручка металлическая', 600);
    const mug = p('mug-1', 'Кружка керамика', 800);
    const nb = p('nb-1', 'Блокнот A5', 900);
    const bottle = p('bt-1', 'Бутылка стекло', 1100);
    const catalog = [charger, pen, mug, nb, bottle];

    for (let i = 0; i < 20; i++) {
      catalog.push(
        p(`extra-${i}`, `Товар ${i}`, 500 + i * 100),
      );
    }

    const concepts: Concept[] = [
      {
        title: 'Set 1',
        narrative: '',
        description: '',
        items: [],
        styleTags: [],
        colorPalette: [],
        whyItFits: '',
        catalogProducts: [
          { id: charger.id, name: charger.name, category: charger.category, price: charger.price },
          { id: pen.id, name: pen.name, category: pen.category, price: pen.price },
          { id: mug.id, name: mug.name, category: mug.category, price: mug.price },
          { id: nb.id, name: nb.name, category: nb.category, price: nb.price },
          { id: bottle.id, name: bottle.name, category: bottle.category, price: bottle.price },
        ],
      },
      {
        title: 'Set 2',
        narrative: '',
        description: '',
        items: [],
        styleTags: [],
        colorPalette: [],
        whyItFits: '',
        catalogProducts: [
          { id: charger.id, name: charger.name, category: charger.category, price: charger.price },
          { id: pen.id, name: pen.name, category: pen.category, price: pen.price },
          { id: mug.id, name: mug.name, category: mug.category, price: mug.price },
          { id: nb.id, name: nb.name, category: nb.category, price: nb.price },
          { id: bottle.id, name: bottle.name, category: bottle.category, price: bottle.price },
        ],
      },
    ];

    const fixed = enforceGlobalConceptUniqueness(concepts, catalog, 'welcome набор', [], 4);
    const allIds: string[] = [];
    for (const c of fixed) {
      for (const pr of c.catalogProducts ?? []) {
        allIds.push(pr.id);
      }
    }
    assert.equal(new Set(allIds).size, allIds.length, `duplicate ids: ${allIds.join(', ')}`);
    assert.ok(!allIds.filter((id) => id === charger.id).length || allIds.filter((id) => id === charger.id).length === 1);
  });
});
