"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogPipelineTiming = void 0;
exports.timedStage = timedStage;
exports.timedStageSync = timedStageSync;
class CatalogPipelineTiming {
    constructor() {
        this.startedAt = Date.now();
        this.lapAt = this.startedAt;
        this.stages = [];
    }
    lap(name) {
        const now = Date.now();
        this.stages.push({ name, ms: now - this.lapAt });
        this.lapAt = now;
    }
    totalMs() {
        return Date.now() - this.startedAt;
    }
    toRecord() {
        const out = {};
        for (const s of this.stages) {
            out[s.name] = (out[s.name] ?? 0) + s.ms;
        }
        out.total = this.totalMs();
        return out;
    }
    toTable() {
        const lines = this.stages.map((s) => `${s.name}\t${s.ms}`);
        lines.push(`total\t${this.totalMs()}`);
        return lines.join('\n');
    }
    stagesSnapshot() {
        return [...this.stages, { name: 'total', ms: this.totalMs() }];
    }
}
exports.CatalogPipelineTiming = CatalogPipelineTiming;
async function timedStage(timing, name, fn) {
    try {
        return await fn();
    }
    finally {
        timing.lap(name);
    }
}
function timedStageSync(timing, name, fn) {
    try {
        return fn();
    }
    finally {
        timing.lap(name);
    }
}
//# sourceMappingURL=catalog-pipeline-timing.util.js.map