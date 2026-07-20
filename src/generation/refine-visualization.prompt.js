"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRefinementImagePrompt = buildRefinementImagePrompt;
function buildRefinementImagePrompt(opts) {
    const brief = opts.refinementBrief.trim();
    return [
        'Edit this branded corporate merchandise lifestyle photograph per the client refinement.',
        `Client refinement: ${brief}`,
        opts.composition ? `Original concept: ${opts.composition.slice(0, 220)}.` : '',
        opts.userPrompt ? `Project brief: ${opts.userPrompt.slice(0, 160)}.` : '',
        opts.productNames?.length
            ? `Products in scene: ${opts.productNames.join(', ')}. Keep the same products unless refinement says otherwise.`
            : '',
        'The FIRST reference image is the current visualization — use it as the base scene.',
        'Apply only the requested changes; preserve photorealism, lighting, scale and branding unless explicitly asked to change.',
        opts.hasLogo
            ? opts.isCatalog
                ? 'Keep client logo on product surfaces only — no floating logo panels, stickers in air, or duplicate logo cards in the background.'
                : 'Keep client logo visible on all branded products.'
            : '',
        'Single cohesive scene, no watermark, no people, no text overlay.',
    ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
}
//# sourceMappingURL=refine-visualization.prompt.js.map