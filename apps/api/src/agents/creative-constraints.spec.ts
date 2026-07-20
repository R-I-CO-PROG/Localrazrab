import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentBriefPayload } from './brief-context.util';
import { pickTopCreativeIdeasLocally, ideaProposesForbiddenItem } from '../providers/llm/creative-fast-select.util';
import type { IdeatorIdea } from './contracts';

const idea = (title: string, items: string[]): IdeatorIdea =>
  ({
    title, description: `Описание ${title}`, hook: 'хук', whyItFits: 'подходит',
    items: items.map((productType) => ({ productType, priority: 'nice' as const })),
    styleTags: [], colorPalette: [],
  }) as IdeatorIdea;

describe('скан#17: креатив-режим не обнуляет обещания брифа', () => {
  it('mustAvoid доходит до payload даже при includeCatalogConstraints=false (креатив)', () => {
    const payload = buildAgentBriefPayload({
      userQuery: 'подарки команде',
      forbiddenItems: ['алкоголь'],
      allowedItems: ['Электроника'],
      includeCatalogConstraints: false, // креатив
    });
    assert.deepEqual(payload.constraints.mustAvoid, ['алкоголь'], 'запреты обнулены для креатива');
    // allowedItems — бакеты каталога, для креатива не применимы.
    assert.equal(payload.constraints.themesToExplore, null);
  });

  it('бюджет доходит до payload в креативе (раньше обнулялся на границе брифа)', () => {
    const payload = buildAgentBriefPayload({
      userQuery: 'подарки команде',
      budgetMin: 1000, budgetMax: 5000,
      includeCatalogConstraints: false,
    });
    assert.deepEqual(payload.budgetRubPerUnit, { min: 1000, max: 5000 });
  });

  it('каталожный режим по-прежнему получает и themesToExplore, и mustAvoid', () => {
    const payload = buildAgentBriefPayload({
      userQuery: 'подарки команде',
      forbiddenItems: ['алкоголь'], allowedItems: ['Электроника'],
      includeCatalogConstraints: true,
    });
    assert.deepEqual(payload.constraints.mustAvoid, ['алкоголь']);
    assert.deepEqual(payload.constraints.themesToExplore, ['Электроника']);
  });
});

describe('скан#17: жёсткий отсев запретов в креативном отборе идей', () => {
  it('идея, ПРЕДЛАГАЮЩАЯ запрещённый предмет, определяется по составу', () => {
    assert.equal(ideaProposesForbiddenItem(idea('A', ['вино', 'бокал']), ['вино']), true);
    assert.equal(ideaProposesForbiddenItem(idea('B', ['кружка', 'блокнот']), ['вино']), false);
  });

  it('описание «набор без алкоголя» НЕ считается предложением запрещённого (матч только по составу)', () => {
    const safe = { ...idea('C', ['кружка']), description: 'Набор полностью без алкоголя' } as IdeatorIdea;
    assert.equal(ideaProposesForbiddenItem(safe, ['алкоголь']), false);
  });

  it('идеи с запрещённым составом не попадают в топ, когда есть чистые альтернативы', () => {
    const ideas = [idea('С вином', ['вино']), idea('Чистая 1', ['кружка']), idea('Чистая 2', ['блокнот'])];
    const out = pickTopCreativeIdeasLocally(ideas, { userQuery: 'подарки', forbiddenItems: ['вино'] }, 5);
    assert.ok(!out.topIdeas.some((t) => t.title === 'С вином'), `запрещённая идея в топе: ${out.topIdeas.map((t) => t.title)}`);
    assert.equal(out.topIdeas.length, 2);
  });

  it('если ВСЕ идеи нарушают запрет — прогон не роняется в ноль (мягкий скор уже утопил их)', () => {
    const ideas = [idea('Вино 1', ['вино']), idea('Вино 2', ['вино'])];
    const out = pickTopCreativeIdeasLocally(ideas, { userQuery: 'подарки', forbiddenItems: ['вино'] }, 5);
    assert.equal(out.topIdeas.length, 2, 'не должны получить пустой список');
  });
});
