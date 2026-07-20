import type { GenerationHistory } from './previous-generation.util';

export const AGENT_RUN_QUEUE = 'agent-run';

export type AgentRunJobData = {
  agentRunId: string;
  requestId: string;
  debug?: boolean;
  aiStyle?: 'catalog' | 'creative';
  /** Товары и концепции из прошлых выдач — исключать при повторной генерации */
  generationHistory?: GenerationHistory | null;
};

export function isAgentsEnabled(config: { get: (k: string, d?: string) => string | undefined }): boolean {
  return config.get('AGENTS_ENABLED', 'false') === 'true';
}

/** Креативная генерация: агенты включены при OPENROUTER или явном AGENTS_ENABLED */
export function isCreativeAgentPipelineEnabled(config: {
  get: (k: string, d?: string) => string | undefined;
}): boolean {
  if (isAgentsEnabled(config)) return true;
  if (config.get('CREATIVE_AGENT_PIPELINE', 'true') === 'false') return false;
  return config.get('OPENROUTER_ENABLED', 'false') === 'true';
}
