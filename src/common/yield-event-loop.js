"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yieldEventLoop = yieldEventLoop;
function yieldEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
}
//# sourceMappingURL=yield-event-loop.js.map