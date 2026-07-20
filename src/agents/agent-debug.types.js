"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDebugEntry = createDebugEntry;
function createDebugEntry(partial) {
    return { ts: new Date().toISOString(), ...partial };
}
//# sourceMappingURL=agent-debug.types.js.map