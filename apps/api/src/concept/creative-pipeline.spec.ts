import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateLocalCreativeIdeas } from '../providers/llm/creative-local-ideator.util';
import { pickTopCreativeIdeasLocally } from '../providers/llm/creative-fast-select.util';

describe('creative fast pipeline utils', () => {
  it('generateLocalCreativeIdeas returns enough ideas without LLM', () => {
    const ideas = generateLocalCreativeIdeas({
      userPrompt: 'Набор для IT-компании, синий бренд',
      colors: ['#0033cc'],
      count: 8,
    });
    assert.ok(ideas.length >= 8);
    assert.ok(ideas[0].items.length >= 3);
  });

  it('pickTopCreativeIdeasLocally selects diverse top ideas', () => {
    const ideas = generateLocalCreativeIdeas({
      userPrompt: 'Подарочный набор для банка',
      count: 10,
    });
    const result = pickTopCreativeIdeasLocally(
      ideas,
      { userQuery: 'банк премиум подарок', category: 'corporate', colors: [] },
      5,
    );
    assert.equal(result.topIdeas.length, 5);
    assert.equal(new Set(result.topIdeas.map((t) => t.title)).size, 5);
  });
});
