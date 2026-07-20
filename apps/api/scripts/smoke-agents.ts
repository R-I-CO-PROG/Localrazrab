/**
 * Smoke tests for agent pipeline (node --test or ts-node)
 * Run: npx ts-node --transpile-only scripts/smoke-agents.ts
 */
import assert from 'node:assert/strict';
import { RouterAgent } from '../src/agents/router.agent';
import { IdeatorAgent } from '../src/agents/ideator.agent';
import { CriticAgent } from '../src/agents/critic.agent';
import { PromptBuilderAgent } from '../src/agents/prompt-builder.agent';
import { OpenrouterAgentClient } from '../src/agents/openrouter-agent.client';

class FakeConfig {
  constructor(private values: Record<string, string> = {}) {}
  get(key: string, defaultValue?: string) {
    return this.values[key] ?? defaultValue;
  }
}

const openrouter = new OpenrouterAgentClient(new FakeConfig({ OPENROUTER_ENABLED: 'false' }) as never);
const router = new RouterAgent(openrouter);
const ideator = new IdeatorAgent(openrouter);
const critic = new CriticAgent(openrouter);
const promptBuilder = new PromptBuilderAgent(openrouter);

async function main() {
  const direct = router.ruleBasedRoute('ручка красная');
  assert.equal(direct.route, 'DIRECT_PRODUCT');
  console.log('✓ ручка красная → DIRECT_PRODUCT');

  const ideation = router.ruleBasedRoute('welcome pack для IT');
  assert.equal(ideation.route, 'IDEATION_PIPELINE');
  console.log('✓ welcome pack для IT → IDEATION_PIPELINE');

  const ideas = await ideator.generateIdeas({ userQuery: 'welcome pack для IT', colors: ['#000'] });
  assert.ok(ideas.ideas.length >= 20 && ideas.ideas.length <= 25);
  console.log(`✓ ideator → ${ideas.ideas.length} ideas`);

  const top = await critic.pickTop5(ideas.ideas, 'welcome pack для IT');
  assert.equal(top.topIdeas.length, 5);
  console.log('✓ critic → 5 top ideas');

  const prompt = await promptBuilder.buildPrompt({
    userQuery: 'welcome pack для IT',
    chosenIdea: top.topIdeas[0],
    productNames: ['Ручка', 'Кружка'],
    colors: ['#1A1A1A'],
    hasLogo: true,
  });
  assert.ok(prompt.imagePrompt.length > 20);
  assert.ok(prompt.negativePrompt.includes('watermark'));
  console.log('✓ promptBuilder → prompts');

  console.log('\nAll agent smoke tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
