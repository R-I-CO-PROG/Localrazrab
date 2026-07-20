import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm.interface';
import { StubLlmProvider } from './stub-llm.provider';
import { DeepseekLlmProvider } from './deepseek-llm.provider';
import { GeminiLlmProvider } from './gemini-llm.provider';
import { OpenrouterLlmProvider } from './openrouter-llm.provider';

export const LLM_PROVIDER = 'LLM_PROVIDER';

@Injectable()
export class LlmProviderFactory {
  private readonly logger = new Logger(LlmProviderFactory.name);

  constructor(
    private readonly config: ConfigService,
    private readonly stub: StubLlmProvider,
    private readonly deepseek: DeepseekLlmProvider,
    private readonly gemini: GeminiLlmProvider,
    private readonly openrouter: OpenrouterLlmProvider,
  ) {}

  getProvider(): LlmProvider {
    const name = this.getEffectiveProviderName();
    switch (name) {
      case 'deepseek':
        return this.deepseek;
      case 'gemini':
        return this.gemini;
      case 'openrouter':
        return this.openrouter;
      case 'stub':
      default:
        return this.stub;
    }
  }

  getEffectiveProviderName(): string {
    const configured = this.config.get<string>('LLM_PROVIDER', 'stub');
    if (configured === 'stub') return 'stub';
    if (configured === 'deepseek') {
      if (!this.config.get<string>('DEEPSEEK_API_KEY')?.trim()) {
        this.logger.warn('DEEPSEEK_API_KEY missing — using stub LLM');
        return 'stub';
      }
      return 'deepseek';
    }
    if (configured === 'openrouter') {
      if (!this.config.get<string>('OPENROUTER_API_KEY')?.trim()) {
        this.logger.warn('OPENROUTER_API_KEY missing — using stub LLM');
        return 'stub';
      }
      return 'openrouter';
    }
    if (!this.config.get<string>('GEMINI_API_KEY')?.trim()) {
      this.logger.warn('GEMINI_API_KEY missing — using stub LLM');
      return 'stub';
    }
    return 'gemini';
  }

  getStubProvider(): StubLlmProvider {
    return this.stub;
  }

  private resolveNamedProvider(name: string): LlmProvider | null {
    switch (name) {
      case 'openrouter':
        return this.config.get<string>('OPENROUTER_API_KEY')?.trim() ? this.openrouter : null;
      case 'gemini':
        return this.config.get<string>('GEMINI_API_KEY')?.trim() ? this.gemini : null;
      case 'deepseek':
        return this.config.get<string>('DEEPSEEK_API_KEY')?.trim() ? this.deepseek : null;
      default:
        return null;
    }
  }

  /** Цепочка LLM для промпта сцены: primary + fallback chain из env */
  getGenerationProviderChain(): Array<{ name: string; provider: LlmProvider }> {
    const configured = this.config.get<string>('LLM_GENERATION_PROVIDER', 'stub');
    if (configured === 'stub') return [];

    const chainRaw = this.config.get<string>('LLM_GENERATION_FALLBACK_CHAIN', '');

    // Если есть Gemini-ключ — ставим первым (стабильнее free OpenRouter)
    const preferGemini =
      this.config.get<string>('LLM_PREFER_GEMINI', 'true') === 'true' &&
      Boolean(this.config.get<string>('GEMINI_API_KEY')?.trim());

    const ordered = preferGemini
      ? ['gemini', configured, ...chainRaw.split(',').map((s) => s.trim())]
      : [configured, ...chainRaw.split(',').map((s) => s.trim())];
    const seen = new Set<string>();
    const chain: Array<{ name: string; provider: LlmProvider }> = [];

    for (const name of ordered) {
      if (seen.has(name)) continue;
      seen.add(name);
      const provider = this.resolveNamedProvider(name);
      if (provider) chain.push({ name, provider });
    }

    if (chain.length === 0) {
      this.logger.warn('No LLM API keys for generation scene prompt');
    }
    return chain;
  }

  /** @deprecated use getGenerationProviderChain */
  getGenerationProvider(): LlmProvider {
    const chain = this.getGenerationProviderChain();
    return chain[0]?.provider ?? this.stub;
  }

  getGenerationProviderName(): string {
    return this.getGenerationProviderChain()[0]?.name ?? 'none';
  }

  /** Цепочка LLM только для парсинга брифа (BRIEF_PARSE_MODEL) */
  getBriefParseProviderChain(): Array<{ name: string; provider: LlmProvider }> {
    const briefModel = this.config.get<string>(
      'BRIEF_PARSE_MODEL',
      'google/gemini-2.5-flash',
    );
    const chain: Array<{ name: string; provider: LlmProvider }> = [];

    if (this.config.get<string>('OPENROUTER_API_KEY')?.trim()) {
      chain.push({ name: `openrouter:${briefModel}`, provider: this.openrouter });
    }
    if (this.config.get<string>('GEMINI_API_KEY')?.trim()) {
      chain.push({ name: 'gemini', provider: this.gemini });
    }

    for (const entry of this.getGenerationProviderChain()) {
      if (!chain.some((c) => c.name === entry.name)) chain.push(entry);
    }

    return chain;
  }

  getProviderName(): string {
    return this.config.get<string>('LLM_PROVIDER', 'stub');
  }
}
