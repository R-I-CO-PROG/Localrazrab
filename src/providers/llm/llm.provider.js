"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var LlmProviderFactory_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmProviderFactory = exports.LLM_PROVIDER = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const stub_llm_provider_1 = require("./stub-llm.provider");
const deepseek_llm_provider_1 = require("./deepseek-llm.provider");
const gemini_llm_provider_1 = require("./gemini-llm.provider");
const openrouter_llm_provider_1 = require("./openrouter-llm.provider");
exports.LLM_PROVIDER = 'LLM_PROVIDER';
let LlmProviderFactory = LlmProviderFactory_1 = class LlmProviderFactory {
    constructor(config, stub, deepseek, gemini, openrouter) {
        this.config = config;
        this.stub = stub;
        this.deepseek = deepseek;
        this.gemini = gemini;
        this.openrouter = openrouter;
        this.logger = new common_1.Logger(LlmProviderFactory_1.name);
    }
    getProvider() {
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
    getEffectiveProviderName() {
        const configured = this.config.get('LLM_PROVIDER', 'stub');
        if (configured === 'stub')
            return 'stub';
        if (configured === 'deepseek') {
            if (!this.config.get('DEEPSEEK_API_KEY')?.trim()) {
                this.logger.warn('DEEPSEEK_API_KEY missing — using stub LLM');
                return 'stub';
            }
            return 'deepseek';
        }
        if (configured === 'openrouter') {
            if (!this.config.get('OPENROUTER_API_KEY')?.trim()) {
                this.logger.warn('OPENROUTER_API_KEY missing — using stub LLM');
                return 'stub';
            }
            return 'openrouter';
        }
        if (!this.config.get('GEMINI_API_KEY')?.trim()) {
            this.logger.warn('GEMINI_API_KEY missing — using stub LLM');
            return 'stub';
        }
        return 'gemini';
    }
    getStubProvider() {
        return this.stub;
    }
    resolveNamedProvider(name) {
        switch (name) {
            case 'openrouter':
                return this.config.get('OPENROUTER_API_KEY')?.trim() ? this.openrouter : null;
            case 'gemini':
                return this.config.get('GEMINI_API_KEY')?.trim() ? this.gemini : null;
            case 'deepseek':
                return this.config.get('DEEPSEEK_API_KEY')?.trim() ? this.deepseek : null;
            default:
                return null;
        }
    }
    getGenerationProviderChain() {
        const configured = this.config.get('LLM_GENERATION_PROVIDER', 'stub');
        if (configured === 'stub')
            return [];
        const chainRaw = this.config.get('LLM_GENERATION_FALLBACK_CHAIN', '');
        const preferGemini = this.config.get('LLM_PREFER_GEMINI', 'true') === 'true' &&
            Boolean(this.config.get('GEMINI_API_KEY')?.trim());
        const ordered = preferGemini
            ? ['gemini', configured, ...chainRaw.split(',').map((s) => s.trim())]
            : [configured, ...chainRaw.split(',').map((s) => s.trim())];
        const seen = new Set();
        const chain = [];
        for (const name of ordered) {
            if (seen.has(name))
                continue;
            seen.add(name);
            const provider = this.resolveNamedProvider(name);
            if (provider)
                chain.push({ name, provider });
        }
        if (chain.length === 0) {
            this.logger.warn('No LLM API keys for generation scene prompt');
        }
        return chain;
    }
    getGenerationProvider() {
        const chain = this.getGenerationProviderChain();
        return chain[0]?.provider ?? this.stub;
    }
    getGenerationProviderName() {
        return this.getGenerationProviderChain()[0]?.name ?? 'none';
    }
    getBriefParseProviderChain() {
        const briefModel = this.config.get('BRIEF_PARSE_MODEL', 'google/gemini-2.5-flash');
        const chain = [];
        if (this.config.get('OPENROUTER_API_KEY')?.trim()) {
            chain.push({ name: `openrouter:${briefModel}`, provider: this.openrouter });
        }
        if (this.config.get('GEMINI_API_KEY')?.trim()) {
            chain.push({ name: 'gemini', provider: this.gemini });
        }
        for (const entry of this.getGenerationProviderChain()) {
            if (!chain.some((c) => c.name === entry.name))
                chain.push(entry);
        }
        return chain;
    }
    getProviderName() {
        return this.config.get('LLM_PROVIDER', 'stub');
    }
};
exports.LlmProviderFactory = LlmProviderFactory;
exports.LlmProviderFactory = LlmProviderFactory = LlmProviderFactory_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        stub_llm_provider_1.StubLlmProvider,
        deepseek_llm_provider_1.DeepseekLlmProvider,
        gemini_llm_provider_1.GeminiLlmProvider,
        openrouter_llm_provider_1.OpenrouterLlmProvider])
], LlmProviderFactory);
//# sourceMappingURL=llm.provider.js.map