/**
 * Self-check for brief profile extraction (run: npx ts-node src/providers/llm/project-brief-profile.selfcheck.ts)
 */
import {
  extractProjectBriefProfile,
  scoreAllowedItemSoftMatch,
  scoreProjectCategorySoftMatch,
} from './project-brief-profile.util';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const profile = extractProjectBriefProfile({
  userPrompt: 'Летний outdoor-набор для IT-конференции, премиальный подарок партнёрам',
  projectCategory: 'Конференция',
  colors: ['#003366'],
});
assert(profile.seasonality === 'summer', 'seasonality');
assert(profile.positioning === 'premium', 'positioning');
assert(scoreProjectCategorySoftMatch('sunglasses', 'Конференция') > 0, 'category soft');
assert(
  scoreAllowedItemSoftMatch('Солнцезащитные очки', 'аксессуар', ['очки']) > 10,
  'allowed soft',
);

console.log('project-brief-profile selfcheck OK');
