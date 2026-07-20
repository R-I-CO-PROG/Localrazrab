import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogConceptService } from '../agents/catalog-concept.service';
import { CatalogNeuralSelectorService } from '../agents/catalog-neural-selector.service';
import { CatalogBuyerAgent } from '../agents/catalog-buyer.agent';
import { generateLocalCatalogIdeas } from '../providers/llm/catalog-local-ideator.util';
import { indexCatalogByProductType } from '../providers/llm/catalog-slot-picker.util';
import { productVariantKey } from '../providers/llm/catalog-variant.util';
import { estimateSetTotalPrice } from '../providers/llm/set-budget.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';

function mockProduct(
  id: string,
  name: string,
  price: number,
  description = '',
): CatalogProduct {
  return {
    id,
    name,
    category: 'Подарки',
    subcategory: null,
    description,
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/product.jpg',
    price,
    stockAvailable: 500,
    colors: [],
  };
}

function buildDiverseCatalog(): CatalogProduct[] {
  const products: CatalogProduct[] = [
    mockProduct('nb-prime', 'Блокнот Prime', 1200, 'блокнот ежедневник prime'),
    mockProduct('nb-prime-blue', 'Блокнот Prime, синий', 1250, 'блокнот ежедневник'),
    mockProduct('nb-a5', 'Блокнот A5 офисный', 900, 'блокнот ежедневник'),
    mockProduct('pen-1', 'Ручка металлическая', 600, 'ручка шариковая'),
    mockProduct('pen-2', 'Ручка премиум', 1500, 'ручка'),
    mockProduct('mug-1', 'Кружка керамика', 800, 'кружка'),
    mockProduct('bottle-1', 'Бутылка стекло', 1100, 'бутылка для воды'),
    mockProduct('thermos-1', 'Термос стальной', 2200, 'термос'),
    mockProduct('shopper-1', 'Шоппер хлопок', 700, 'шоппер сумка'),
    mockProduct('flash-1', 'Флешка USB 16GB', 950, 'флешка usb'),
    mockProduct('pb-1', 'Powerbank 5000', 1800, 'powerbank зарядка'),
    mockProduct('cap-1', 'Кепка бейсбол', 1000, 'кепка'),
    mockProduct('hoodie-1', 'Худи оверсайз', 3500, 'худи'),
    mockProduct('diary-1', 'Ежедневник датированный', 1400, 'ежедневник блокнот'),
    mockProduct('diary-2', 'Ежедневник классик', 1450, 'ежедневник блокнот'),
    mockProduct('diary-3', 'Ежедневник премиум', 1500, 'ежедневник блокнот'),
    mockProduct('umbrella-1', 'Зонт складной', 1600, 'зонт'),
  ];

  const templates: Array<[string, string, number, string]> = [
    ['pen', 'Ручка офис', 1200, 'ручка'],
    ['notebook', 'Блокнот линия', 1500, 'блокнот'],
    ['mug', 'Кружка', 1400, 'кружка'],
    ['bottle', 'Бутылка', 1600, 'бутылка'],
    ['bag', 'Сумка', 1800, 'сумка'],
    ['tshirt', 'Футболка', 2200, 'футболка'],
    ['thermos', 'Термос', 2400, 'термос'],
    ['powerbank', 'Powerbank', 2600, 'powerbank зарядка'],
  ];

  for (let i = 0; i < 36; i++) {
    const [type, base, price, desc] = templates[i % templates.length];
    products.push(mockProduct(`${type}-x${i}`, `${base} ${i}`, price + (i % 5) * 200, desc));
  }

  return products;
}

describe('CatalogConceptService.discoverConcepts', () => {
  it('produces 5 disjoint sets within budget and item bounds', async () => {
    const catalog = buildDiverseCatalog();
    const typeIndex = indexCatalogByProductType(catalog);
    const briefText =
      'Корпоративный welcome-набор: блокнот и ручка обязательны. ' +
      'Бюджет 6000-8000 рублей на набор. 4-5 предметов.';

    const ideas = generateLocalCatalogIdeas({
      userPrompt: briefText,
      category: 'Корпоративные подарки',
      desiredItemCount: 5,
      mandatoryTypes: ['notebook', 'pen'],
    });

    const mockLlmBrief = {
      prepareCatalogPipeline: async () => ({
        filtered: catalog,
        relevance: catalog,
        forLlm: catalog,
        overview: {
          totalProducts: catalog.length,
          totalInDatabase: catalog.length,
          categories: [{ name: 'Подарки', count: catalog.length }],
        },
        typeIndex,
        totalInDb: catalog.length,
      }),
    };

    const mockIdeator = {
      generateIdeas: async () => ({ ideas, usedFallback: true }),
    };

    const mockConfig = {
      get: (key: string, fallback?: string) => {
        if (key === 'CATALOG_TARGET_CONCEPTS') return '5';
        if (key === 'CATALOG_FAST_PIPELINE') return 'true';
        if (key === 'CATALOG_STRATIFIED_MAX') return '480';
        if (key === 'CATALOG_RUN_SEED') return '777';
        if (key === 'CATALOG_NEURAL_SELECTOR') return 'false';
        return fallback ?? 'true';
      },
    };

    const service = new CatalogConceptService(
      mockLlmBrief as never,
      {} as never,
      mockConfig as never,
      mockIdeator as never,
      { pickTop5: async () => ({ topIdeas: [] }) } as never,
      { isEnabled: () => false, chatJson: async () => '{}' } as never,
      { selectConceptProducts: async () => [] } as never,
      { semanticFit: async () => new Map(), similarToUsed: async () => new Set(), topProfileProducts: async () => [] } as never,
    );

    const result = await service.discoverConcepts(
      {
        userQuery: briefText,
        category: 'Корпоративные подарки',
        budgetMin: 6000,
        budgetMax: 8000,
        colors: ['зеленый'],
      },
      {
        userPrompt: briefText,
        category: 'Корпоративные подарки',
        budgetMin: 6000,
        budgetMax: 8000,
        quantity: 100,
        colors: ['зеленый'],
        allowedItems: [],
        forbiddenItems: [],
        assets: [],
        minProductsPerSet: 5,
        maxProductsPerSet: 5,
        useProductCountLimit: true,
      },
    );

    assert.equal(result.concepts.length, 5, 'expected 5 concepts');

    const allIds: string[] = [];
    const allVariants: string[] = [];

    for (const concept of result.concepts) {
      const products = concept.catalogProducts ?? [];
      assert.ok(
        products.length === 5,
        `concept "${concept.title}" has ${products.length} items, expected 5`,
      );

      const total = estimateSetTotalPrice(products as unknown as CatalogProduct[]);
      assert.ok(
        total >= 6000 && total <= 8000,
        `concept "${concept.title}" total ${total} outside [6000, 8000]`,
      );

      for (const p of products) {
        allIds.push(p.id);
        allVariants.push(productVariantKey(p as CatalogProduct));
      }
    }

    const uniqueIds = new Set(allIds);
    assert.equal(
      uniqueIds.size,
      allIds.length,
      `duplicate productIds across concepts: ${allIds.filter((id, i) => allIds.indexOf(id) !== i).join(', ')}`,
    );

    const uniqueVariants = new Set(allVariants);
    assert.equal(
      uniqueVariants.size,
      allVariants.length,
      `duplicate variant keys across concepts`,
    );

    const primeCount = allIds.filter((id) => id.startsWith('nb-prime')).length;
    assert.ok(primeCount <= 1, `Блокнот Prime repeated ${primeCount} times across 5 sets`);
  });

  it('G6: идеатор получает ОБОГАЩЁННЫЕ цвета (извлечённые из брифа), а не сырые request.colors', async () => {
    const catalog = buildDiverseCatalog();
    const typeIndex = indexCatalogByProductType(catalog);
    // Цвет назван в СВОБОДНОМ ТЕКСТЕ брифа, а не в поле «Цвета» (request.colors пуст).
    const briefText = 'Корпоративный набор сотрудникам, в жёлтых тонах. Бюджет 4000-8000₽. 3-5 предметов.';
    const ideas = generateLocalCatalogIdeas({
      userPrompt: briefText,
      category: 'Корпоративные подарки',
      desiredItemCount: 5,
      mandatoryTypes: [],
    });
    const mockLlmBrief = {
      prepareCatalogPipeline: async () => ({
        filtered: catalog, relevance: catalog, forLlm: catalog,
        overview: { totalProducts: catalog.length, totalInDatabase: catalog.length, categories: [{ name: 'Подарки', count: catalog.length }] },
        typeIndex, totalInDb: catalog.length,
      }),
    };
    let capturedColors: unknown = null;
    const capturingIdeator = {
      generateIdeas: async (input: { colors?: unknown }) => {
        capturedColors = input.colors;
        return { ideas, usedFallback: true };
      },
    };
    const mockConfig = {
      get: (key: string, fallback?: string) => {
        if (key === 'CATALOG_TARGET_CONCEPTS') return '5';
        if (key === 'CATALOG_FAST_PIPELINE') return 'true';
        if (key === 'CATALOG_NEURAL_SELECTOR') return 'false';
        return fallback ?? 'true';
      },
    };
    const service = new CatalogConceptService(
      mockLlmBrief as never, {} as never, mockConfig as never, capturingIdeator as never,
      { pickTop5: async () => ({ topIdeas: [] }) } as never,
      { isEnabled: () => false, chatJson: async () => '{}' } as never,
      { selectConceptProducts: async () => [] } as never,
      { semanticFit: async () => new Map(), similarToUsed: async () => new Set(), topProfileProducts: async () => [] } as never,
    );
    await service.discoverConcepts(
      { userQuery: briefText, category: 'Корпоративные подарки', budgetMin: 4000, budgetMax: 8000, colors: [] },
      { userPrompt: briefText, category: 'Корпоративные подарки', budgetMin: 4000, budgetMax: 8000, quantity: 100, colors: [], allowedItems: [], forbiddenItems: [], assets: [], minProductsPerSet: 3, maxProductsPerSet: 5, useProductCountLimit: true },
    );
    const colorsArr = (capturedColors as string[]) ?? [];
    // extractBriefColorsFromText маппит «жёлтых» → hex #EAB308. request.colors был ПУСТ, поэтому
    // непустой цвет у идеатора доказывает, что дошли ОБОГАЩЁННЫЕ цвета (а не сырой briefInput.colors).
    assert.ok(
      colorsArr.some((c) => /#eab308/i.test(c)),
      `идеатор должен получить жёлтый (#EAB308) из брифа, получено: ${JSON.stringify(colorsArr)}`,
    );
  });

  it('neural selector path: 5 non-empty disjoint sets even without LLM (contract)', async () => {
    const catalog = buildDiverseCatalog();
    const typeIndex = indexCatalogByProductType(catalog);
    const briefText = 'Корпоративный набор сотрудникам. Бюджет 4000-8000₽. 3-5 предметов.';

    const ideas = generateLocalCatalogIdeas({
      userPrompt: briefText,
      category: 'Корпоративные подарки',
      desiredItemCount: 5,
      mandatoryTypes: [],
    });

    const mockLlmBrief = {
      prepareCatalogPipeline: async () => ({
        filtered: catalog,
        relevance: catalog,
        forLlm: catalog,
        overview: {
          totalProducts: catalog.length,
          totalInDatabase: catalog.length,
          categories: [{ name: 'Подарки', count: catalog.length }],
        },
        typeIndex,
        totalInDb: catalog.length,
      }),
    };
    const mockIdeator = { generateIdeas: async () => ({ ideas, usedFallback: true }) };
    const mockConfig = {
      get: (key: string, fallback?: string) => {
        if (key === 'CATALOG_TARGET_CONCEPTS') return '5';
        if (key === 'CATALOG_FAST_PIPELINE') return 'true';
        if (key === 'CATALOG_NEURAL_SELECTOR') return 'true';
        if (key === 'CATALOG_RUN_SEED') return '777';
        return fallback ?? 'true';
      },
    };

    // Байер с выключенным OpenRouter → возвращает null → проверяем детерминированный контракт.
    const buyer = new CatalogBuyerAgent(
      { isEnabled: () => false, chatJson: async () => '{}' } as never,
      mockConfig as never,
    );
    const neural = new CatalogNeuralSelectorService(buyer);

    const service = new CatalogConceptService(
      mockLlmBrief as never,
      {} as never,
      mockConfig as never,
      mockIdeator as never,
      { pickTop5: async () => ({ topIdeas: [] }) } as never,
      { isEnabled: () => false, chatJson: async () => '{}' } as never,
      neural,
      { semanticFit: async () => new Map(), similarToUsed: async () => new Set(), topProfileProducts: async () => [] } as never,
    );

    const result = await service.discoverConcepts(
      { userQuery: briefText, category: 'Корпоративные подарки', budgetMin: 4000, budgetMax: 8000, colors: [] },
      {
        userPrompt: briefText,
        category: 'Корпоративные подарки',
        budgetMin: 4000,
        budgetMax: 8000,
        quantity: 100,
        colors: [],
        allowedItems: [],
        forbiddenItems: [],
        assets: [],
        minProductsPerSet: 3,
        maxProductsPerSet: 5,
        useProductCountLimit: true,
      },
    );

    assert.equal(result.concepts.length, 5, `expected 5 concepts, got ${result.concepts.length}`);
    const allIds: string[] = [];
    for (const concept of result.concepts) {
      const products = concept.catalogProducts ?? [];
      assert.ok(
        products.length >= 3 && products.length <= 5,
        `concept "${concept.title}" has ${products.length} items, expected 3..5`,
      );
      for (const p of products) allIds.push(p.id);
    }
    assert.equal(new Set(allIds).size, allIds.length, 'duplicate productIds across neural sets');
  });

  it('G3: не мутирует товарные объекты из pipeline-кэша (semanticFit не пишется в общие ссылки)', async () => {
    // Регресс из пере-скана: rawCandidatesCacheKey НЕ ключуется по userPrompt (только по
    // categoryGroup+бюджету+seed) — товарные ОБЪЕКТЫ разделяются между разными брифами. Раньше
    // discoverConceptsInner писал semanticFit прямо в эти объекты и unshift-ил в общий массив
    // relevance/broad, «заражая» другой запрос той же группы. Мок здесь имитирует именно эту
    // общую ссылку: prepareCatalogPipeline каждый раз возвращает ОДИН И ТОТ ЖЕ массив/объекты.
    const catalog = buildDiverseCatalog();
    const typeIndex = indexCatalogByProductType(catalog);
    const briefText = 'Набор для айтишников. Бюджет 4000-8000₽. 3-5 предметов.';
    const ideas = generateLocalCatalogIdeas({
      userPrompt: briefText,
      category: 'Корпоративные подарки',
      desiredItemCount: 5,
      mandatoryTypes: [],
    });

    // Разделяемый между «запросами» pipeline-результат (та же ссылка на массивы/объекты — как
    // если бы получен из raw-candidates-кэша, который не знает про userPrompt).
    const sharedPipelineResult = {
      filtered: catalog,
      relevance: catalog,
      forLlm: catalog,
      overview: {
        totalProducts: catalog.length,
        totalInDatabase: catalog.length,
        categories: [{ name: 'Подарки', count: catalog.length }],
      },
      typeIndex,
      totalInDb: catalog.length,
    };
    const mockLlmBrief = { prepareCatalogPipeline: async () => sharedPipelineResult };
    const mockIdeator = { generateIdeas: async () => ({ ideas, usedFallback: true }) };
    const mockConfig = {
      get: (key: string, fallback?: string) => {
        if (key === 'CATALOG_TARGET_CONCEPTS') return '5';
        if (key === 'CATALOG_FAST_PIPELINE') return 'true';
        if (key === 'CATALOG_NEURAL_SELECTOR') return 'true';
        if (key === 'CATALOG_RUN_SEED') return '777';
        return fallback ?? 'true';
      },
    };
    const buyer = new CatalogBuyerAgent(
      { isEnabled: () => false, chatJson: async () => '{}' } as never,
      mockConfig as never,
    );
    const neural = new CatalogNeuralSelectorService(buyer);

    // embeddingService возвращает НЕТРИВИАЛЬНЫЙ semanticFit для конкретных id — именно это раньше
    // писалось прямо в общие товарные объекты.
    const embeddingService = {
      semanticFit: async () => new Map([['mug-1', 0.42], ['pen-1', -0.31]]),
      similarToUsed: async () => new Set<string>(),
      topProfileProducts: async () => [],
    };

    const service = new CatalogConceptService(
      mockLlmBrief as never,
      {} as never,
      mockConfig as never,
      mockIdeator as never,
      { pickTop5: async () => ({ topIdeas: [] }) } as never,
      { isEnabled: () => false, chatJson: async () => '{}' } as never,
      neural,
      embeddingService as never,
    );

    const requestArgs = {
      userQuery: briefText,
      category: 'Корпоративные подарки',
      budgetMin: 4000,
      budgetMax: 8000,
      colors: [],
    };
    const filterArgs = {
      userPrompt: briefText,
      category: 'Корпоративные подарки',
      budgetMin: 4000,
      budgetMax: 8000,
      quantity: 100,
      colors: [],
      allowedItems: [],
      forbiddenItems: [],
      assets: [],
      minProductsPerSet: 3,
      maxProductsPerSet: 5,
      useProductCountLimit: true,
    };

    await service.discoverConcepts(requestArgs as never, filterArgs as never);

    // КЛЮЧЕВАЯ ПРОВЕРКА: исходные объекты из «общего кэша» НЕ должны получить semanticFit —
    // мутация обязана была уйти в клон, а не в эти shared-ссылки.
    const mug = catalog.find((p) => p.id === 'mug-1');
    const pen = catalog.find((p) => p.id === 'pen-1');
    assert.equal(
      (mug as unknown as { semanticFit?: number })?.semanticFit,
      undefined,
      'semanticFit не должен утечь в общий объект каталога (mug-1)',
    );
    assert.equal(
      (pen as unknown as { semanticFit?: number })?.semanticFit,
      undefined,
      'semanticFit не должен утечь в общий объект каталога (pen-1)',
    );
    // И общий массив relevance не должен быть unshift-нут (длина не изменилась).
    assert.equal(sharedPipelineResult.relevance.length, catalog.length, 'общий массив relevance не должен мутироваться unshift-ом');
  });
});
