import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogNeuralSelectorService } from './catalog-neural-selector.service';
import { SelectionLedger } from '../providers/llm/catalog-selection-ledger';
import { clearProductTypeCache } from '../concept/product-taxonomy';
import type { CatalogProduct } from '../providers/llm/catalog.util';

function prod(
  id: string,
  name: string,
  category: string,
  price: number,
): CatalogProduct {
  return {
    id,
    name,
    category,
    subcategory: null,
    description: name,
    price,
    stockAvailable: 50,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

// Байер недоступен → проверяем детерминированный путь (контракт) целиком.
const buyerNull = { selectForConcept: async () => null } as never;

describe('CatalogNeuralSelectorService', () => {
  beforeEach(() => clearProductTypeCache());

  it('returns a non-empty, dedup set even when the LLM buyer is unavailable', async () => {
    const catalog = [
      prod('1', 'Термокружка стальная', 'Термосы и бутылки', 500),
      prod('2', 'Блокнот A5', 'Ежедневники и блокноты', 300),
      prod('3', 'Рюкзак городской', 'Сумки и рюкзаки', 900),
      prod('4', 'Ручка металлическая', 'Ручки', 150),
    ];
    const svc = new CatalogNeuralSelectorService(buyerNull);
    const out = await svc.selectConceptProducts({
      raw: {
        title: 'Набор',
        composition: '',
        items: [],
        productSlots: [
          { type: 'thermos', priority: 'must' },
          { type: 'notebook', priority: 'nice' },
          { type: 'bag', priority: 'nice' },
        ],
      },
      boldness: 0,
      catalog,
      fullCatalog: catalog,
      ledger: new SelectionLedger(new Set(), new Set(), new Set(), 'набор'),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 3000,
      brief: 'набор сотрудникам',
      brandColors: [],
    });
    assert.ok(out.length >= 3, `expected >= 3 products, got ${out.length}`);
    assert.equal(new Set(out.map((p) => p.id)).size, out.length);
  });

  it('still produces a set when the idea has no productSlots', async () => {
    const catalog = [
      prod('1', 'Термокружка стальная', 'Термосы и бутылки', 500),
      prod('2', 'Блокнот A5', 'Ежедневники и блокноты', 300),
      prod('3', 'Рюкзак городской', 'Сумки и рюкзаки', 900),
    ];
    const svc = new CatalogNeuralSelectorService(buyerNull);
    const out = await svc.selectConceptProducts({
      raw: { title: 'Набор без слотов' },
      boldness: 1,
      catalog,
      fullCatalog: catalog,
      ledger: new SelectionLedger(new Set(), new Set(), new Set(), 'набор'),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 3000,
      brief: 'набор сотрудникам',
      brandColors: [],
    });
    assert.ok(out.length >= 3, `expected >= 3 products, got ${out.length}`);
  });

  it('mandatory "thermos" освобождает от structural-trim товар-алиас thermos_mug/tumbler, а не только точный slug', async () => {
    const catalog = [
      // единственный товар drink-семейства — термокружка (slug thermos_mug, alias mandatory-типа thermos).
      prod('mug', 'Термокружка стальная', 'Термосы и бутылки', 500),
      prod('nb', 'Блокнот A5', 'Ежедневники и блокноты', 300),
      prod('bag', 'Рюкзак городской', 'Сумки и рюкзаки', 900),
      prod('pen', 'Ручка металлическая', 'Ручки', 150),
    ];
    const svc = new CatalogNeuralSelectorService(buyerNull);
    const out = await svc.selectConceptProducts({
      raw: { title: 'Набор', composition: '', items: [] },
      boldness: 0,
      catalog,
      fullCatalog: catalog,
      ledger: new SelectionLedger(new Set(), new Set(), new Set(), 'набор'),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 3000,
      brief: 'набор с термосом сотрудникам',
      brandColors: [],
      mandatoryTypes: ['thermos'],
      // 'drink' крупная группа уже исчерпана в 3 из 5 наборов прогона (>= COARSE_MAX_CONCEPTS) —
      // без alias-моста structural-trim выбросил бы thermos_mug из пула (slug !== 'thermos').
      coarseFamilyUsage: new Map([['drink', 3]]),
    });
    assert.ok(
      out.some((p) => p.id === 'mug'),
      `mandatory thermos (alias thermos_mug) должен пережить structural-trim: ${out.map((p) => p.id)}`,
    );
  });
});
