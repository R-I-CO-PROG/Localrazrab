import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogBuyerAgent } from './catalog-buyer.agent';
import type { NeuralSelectionInput } from '../providers/llm/catalog-neural-selector.types';

const cfg = { get: (_k: string, d?: unknown) => d } as never;

const input: NeuralSelectionInput = {
  brief: 'кофейный набор',
  conceptTitle: 'Утро',
  conceptNarrative: 'бодрое начало дня',
  boldness: 0,
  budgetPerSet: 1500,
  minItems: 3,
  maxItems: 5,
  brandColors: [],
  shortlists: [
    {
      slot: { type: 'thermos', priority: 'must' },
      candidates: [
        {
          id: 'A',
          name: 'Термокружка',
          category: 'Термосы и бутылки',
          subcategory: null,
          description: null,
          price: 500,
          stockAvailable: 10,
          colors: [],
          silhouetteImageUrl: '',
          catalogImageUrl: 'https://x/i.jpg',
          imageUrl: 'https://x/i.jpg',
        },
      ],
    },
  ],
};

describe('CatalogBuyerAgent', () => {
  it('parses LLM choices', async () => {
    const orOk = {
      isEnabled: () => true,
      chatJson: async () =>
        JSON.stringify({
          choices: [{ slotIndex: 0, productId: 'A', reason: 'fits' }],
          coherenceNote: 'ok',
        }),
    } as never;
    const agent = new CatalogBuyerAgent(orOk, cfg);
    const res = await agent.selectForConcept(input);
    assert.ok(res);
    assert.deepEqual(res!.choices[0], {
      slotIndex: 0,
      productId: 'A',
      reason: 'fits',
    });
  });

  it('returns null when OpenRouter disabled', async () => {
    const orOff = { isEnabled: () => false, chatJson: async () => '{}' } as never;
    const agent = new CatalogBuyerAgent(orOff, cfg);
    assert.equal(await agent.selectForConcept(input), null);
  });

  it('returns null on malformed JSON instead of throwing', async () => {
    const orBad = {
      isEnabled: () => true,
      chatJson: async () => 'not json at all',
    } as never;
    const agent = new CatalogBuyerAgent(orBad, cfg);
    assert.equal(await agent.selectForConcept(input), null);
  });

  it('returns null on timeout instead of throwing', async () => {
    const orHang = {
      isEnabled: () => true,
      chatJson: () => new Promise<string>(() => {}),
    } as never;
    const cfgFast = { get: (k: string, d?: unknown) => (k === 'OPENROUTER_TIMEOUT_MS_CATALOG_SELECTOR' ? 50 : d) } as never;
    const agent = new CatalogBuyerAgent(orHang, cfgFast);
    assert.equal(await agent.selectForConcept(input), null);
  });
});
