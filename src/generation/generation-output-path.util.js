"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conceptFileKey = conceptFileKey;
exports.buildGenerationOutputFilename = buildGenerationOutputFilename;
const crypto_1 = require("crypto");
function conceptFileKey(title) {
    const t = title?.trim() || 'default';
    const ascii = t
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (ascii.length >= 3)
        return ascii.slice(0, 40);
    const hash = (0, crypto_1.createHash)('sha1').update(t).digest('hex').slice(0, 10);
    return `c${hash}`;
}
function buildGenerationOutputFilename(generationId, snapshot) {
    const revision = Math.max(1, Number(snapshot.revision) || 1);
    const key = conceptFileKey(snapshot.chosenIdeaTitle);
    return `${generationId}-${key}-r${revision}.png`;
}
//# sourceMappingURL=generation-output-path.util.js.map