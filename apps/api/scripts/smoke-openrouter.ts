/**
 * Smoke test OpenRouter: Ideator → Critic JSON flow (same as creative pipeline).
 * Usage: pnpm exec tsx scripts/smoke-openrouter.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { OpenrouterAgentClient } from '../src/agents/openrouter-agent.client';
import { parseIdeatorOutput, parseCriticOutput } from '../src/agents/json-repair.util';
import {
  SYSTEM_PROMPT_IDEATOR_CREATIVE,
  SYSTEM_PROMPT_CRITIC_CREATIVE,
} from '../src/agents/prompts';
import type { CriticOutput, IdeatorOutput } from '../src/agents/contracts';

function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  const text = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  const map: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return map;
}

class EnvConfig {
  constructor(private readonly env: Record<string, string>) {}
  get(key: string, defaultValue?: string): string | undefined {
    return this.env[key] ?? defaultValue;
  }
}

async function main() {
  const env = loadEnv();
  const client = new OpenrouterAgentClient(new EnvConfig(env) as never);
  console.log('OpenRouter enabled:', client.isEnabled());
  console.log('Model:', env.OPENROUTER_MODEL_IDEATOR);

  const userBrief = JSON.stringify({
    task: 'Корпоративный подарок для IT-компании: современный минимализм, синий и белый',
    colors: ['#0055FF', '#FFFFFF'],
    hasLogo: true,
    mode: 'creative',
  });

  console.log('\n--- Ideator ---');
  const t0 = Date.now();
  const ideatorRaw = await client.chatJson({
    systemPrompt: SYSTEM_PROMPT_IDEATOR_CREATIVE,
    userMessage: userBrief,
    modelEnvKey: 'OPENROUTER_MODEL_IDEATOR',
    maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_IDEATOR',
    defaultMaxTokens: 3500,
    agentName: 'SmokeIdeator',
  });
  console.log(`Ideator OK in ${Date.now() - t0}ms, ${ideatorRaw.length} chars`);

  let ideator: IdeatorOutput;
  try {
    ideator = parseIdeatorOutput(ideatorRaw);
  } catch (e) {
    console.error('Ideator JSON parse FAILED:', e);
    console.error('Raw tail:', ideatorRaw.slice(-300));
    process.exit(1);
  }
  console.log(`Parsed ${ideator.ideas?.length ?? 0} ideas`);
  if (!ideator.ideas?.length) {
    console.error('No ideas in response');
    process.exit(1);
  }
  console.log('First idea:', ideator.ideas[0].title);

  console.log('\n--- Critic ---');
  const t1 = Date.now();
  const criticRaw = await client.chatJson({
    systemPrompt: SYSTEM_PROMPT_CRITIC_CREATIVE,
    userMessage: JSON.stringify({
      userQuery: 'IT-компания минимализм',
      mode: 'creative',
      ideas: ideator.ideas.slice(0, 12),
    }),
    modelEnvKey: 'OPENROUTER_MODEL_CRITIC',
    maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_CRITIC',
    defaultMaxTokens: 1200,
    agentName: 'SmokeCritic',
  });
  console.log(`Critic OK in ${Date.now() - t1}ms, ${criticRaw.length} chars`);

  let critic: CriticOutput;
  try {
    critic = parseCriticOutput(criticRaw);
  } catch (e) {
    console.error('Critic JSON parse FAILED:', e);
    console.error('Raw:', criticRaw.slice(0, 500));
    process.exit(1);
  }
  console.log(`Top ideas: ${critic.topIdeas?.length ?? 0}`);
  console.log('\n✓ OpenRouter smoke test passed');
}

main().catch((err) => {
  console.error('\n✗ OpenRouter smoke test FAILED');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
