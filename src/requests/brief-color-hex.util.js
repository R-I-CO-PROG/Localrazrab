"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeHex = normalizeHex;
function normalizeHex(input) {
    const raw = input.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(raw))
        return `#${raw.toUpperCase()}`;
    if (/^[0-9a-fA-F]{3}$/.test(raw)) {
        return `#${raw
            .split('')
            .map((c) => c + c)
            .join('')
            .toUpperCase()}`;
    }
    return null;
}
//# sourceMappingURL=brief-color-hex.util.js.map