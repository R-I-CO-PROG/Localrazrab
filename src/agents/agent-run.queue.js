"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_RUN_QUEUE = void 0;
exports.isAgentsEnabled = isAgentsEnabled;
exports.isCreativeAgentPipelineEnabled = isCreativeAgentPipelineEnabled;
exports.AGENT_RUN_QUEUE = 'agent-run';
function isAgentsEnabled(config) {
    return config.get('AGENTS_ENABLED', 'false') === 'true';
}
function isCreativeAgentPipelineEnabled(config) {
    if (isAgentsEnabled(config))
        return true;
    if (config.get('CREATIVE_AGENT_PIPELINE', 'true') === 'false')
        return false;
    return config.get('OPENROUTER_ENABLED', 'false') === 'true';
}
//# sourceMappingURL=agent-run.queue.js.map