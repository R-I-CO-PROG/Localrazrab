"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProductionEnv = isProductionEnv;
exports.resolveDebugFlag = resolveDebugFlag;
exports.requireProductionSecret = requireProductionSecret;
function isProductionEnv() {
    return process.env.NODE_ENV === 'production';
}
function resolveDebugFlag(requested) {
    if (isProductionEnv())
        return false;
    return requested ?? false;
}
function requireProductionSecret(name, value) {
    if (!isProductionEnv())
        return;
    if (!value?.trim()) {
        throw new Error(`${name} must be set in production`);
    }
}
//# sourceMappingURL=env.util.js.map