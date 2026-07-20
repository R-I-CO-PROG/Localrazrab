"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const project_brief_profile_util_1 = require("./project-brief-profile.util");
function assert(cond, msg) {
    if (!cond)
        throw new Error(msg);
}
const profile = (0, project_brief_profile_util_1.extractProjectBriefProfile)({
    userPrompt: 'Летний outdoor-набор для IT-конференции, премиальный подарок партнёрам',
    projectCategory: 'Конференция',
    colors: ['#003366'],
});
assert(profile.seasonality === 'summer', 'seasonality');
assert(profile.positioning === 'premium', 'positioning');
assert((0, project_brief_profile_util_1.scoreProjectCategorySoftMatch)('sunglasses', 'Конференция') > 0, 'category soft');
assert((0, project_brief_profile_util_1.scoreAllowedItemSoftMatch)('Солнцезащитные очки', 'аксессуар', ['очки']) > 10, 'allowed soft');
console.log('project-brief-profile selfcheck OK');
//# sourceMappingURL=project-brief-profile.selfcheck.js.map