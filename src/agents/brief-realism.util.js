"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.briefAllowsFuturism = briefAllowsFuturism;
exports.briefSuggestsTransport = briefSuggestsTransport;
exports.gimmickPenalty = gimmickPenalty;
exports.realismBoost = realismBoost;
exports.adjustedBriefFitScore = adjustedBriefFitScore;
const GIMMICK_PATTERNS = [
    /дрон/i,
    /drone/i,
    /вакуум/i,
    /vacuum/i,
    /tunnel/i,
    /тунnel/i,
    /роллер/i,
    /roller/i,
    /скутер/i,
    /scooter/i,
    /гирлянд/i,
    /коридор.*достав/i,
    /office corridor/i,
    /картон.*модул/i,
    /cardboard/i,
    /микро.?мобил/i,
    /smart.?box/i,
    /пневм/i,
    /magnetic platform/i,
    /self.?balanc/i,
];
const FUTURISM_BRIEF = /иннова|футур|прототип|концепт.?кар|стартап|experimental|drone|беспилот|robot delivery|R&D/i;
const TRANSPORT_BRIEF = /транспорт|доставк|логист|fleet|фур|грузов|фургон|авто|машин|vehicle|truck|van|delivery|shipping/i;
function briefAllowsFuturism(brief) {
    return FUTURISM_BRIEF.test(brief);
}
function briefSuggestsTransport(brief) {
    return TRANSPORT_BRIEF.test(brief);
}
function gimmickPenalty(text, brief) {
    if (briefAllowsFuturism(brief))
        return 0;
    let penalty = 0;
    for (const pattern of GIMMICK_PATTERNS) {
        if (pattern.test(text))
            penalty += 18;
    }
    if (briefSuggestsTransport(brief) && penalty > 0) {
        penalty += 12;
    }
    return Math.min(penalty, 55);
}
function realismBoost(text, brief) {
    if (!briefSuggestsTransport(brief))
        return 0;
    let boost = 0;
    const realistic = [
        /фур/i,
        /грузов/i,
        /truck/i,
        /фургон/i,
        /van/i,
        /авто/i,
        /машин/i,
        /car/i,
        /логист/i,
        /склад/i,
        /warehouse/i,
        /брендир.*(авто|фур|фургон)/i,
        /vehicle wrap/i,
        /car carrier/i,
        /delivery van/i,
    ];
    for (const pattern of realistic) {
        if (pattern.test(text))
            boost += 8;
    }
    return Math.min(boost, 24);
}
function adjustedBriefFitScore(baseScore, ideaText, brief) {
    const adjusted = baseScore - gimmickPenalty(ideaText, brief) + realismBoost(ideaText, brief);
    return Math.max(0, Math.min(100, Math.round(adjusted)));
}
//# sourceMappingURL=brief-realism.util.js.map