import type { CriticOutput, CriticTopIdea, IdeatorIdea } from '../../agents/contracts';
import type { AgentBriefContext } from '../../agents/brief-context.util';
import { adjustedBriefFitScore, gimmickPenalty, briefAllowsFuturism } from '../../agents/brief-realism.util';

function normalizeText(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е');
}

function scoreCreativeIdea(idea: IdeatorIdea, brief: AgentBriefContext): number {
  const briefText = normalizeText(brief.userQuery ?? '');
  const blob = `${idea.title} ${idea.hook ?? ''} ${idea.description} ${idea.whyItFits ?? ''} ${
    (idea.items ?? []).map((i) => `${i.productType} ${i.notes ?? ''}`).join(' ')
  }`;
  let score = adjustedBriefFitScore(72, blob, brief.userQuery ?? '');

  const tokens = briefText.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 4);
  for (const token of tokens) {
    if (normalizeText(blob).includes(token)) score += 3;
  }

  if ((idea.items ?? []).length >= 3) score += 6;
  if (idea.hook?.trim()) score += 4;
  if (idea.whyItFits?.trim()) score += 4;

  if (!briefAllowsFuturism(brief.userQuery ?? '') && gimmickPenalty(blob, brief.userQuery ?? '') > 30) {
    score -= 25;
  }

  const forbidden = (brief.forbiddenItems ?? []).map((s) => s.toLowerCase());
  for (const f of forbidden) {
    if (f.length > 2 && normalizeText(blob).includes(f)) score -= 40;
  }

  return score;
}

function titlesTooSimilar(a: string, b: string): boolean {
  const na = normalizeText(a).replace(/\s+\d+$/, '');
  const nb = normalizeText(b).replace(/\s+\d+$/, '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = nb.split(/\s+/).filter((w) => w.length > 3);
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  return overlap >= 2;
}

/** Быстрый отбор top-N без второго LLM-вызова (Critic) для креативного режима. */
/**
 * Идея ПРЕДЛАГАЕТ запрещённый предмет? Смотрим ТОЛЬКО на состав (items.productType/notes) — это
 * и есть «что получит клиент». По всему тексту идеи матчить нельзя: описание «набор БЕЗ алкоголя»
 * содержало бы токен и ложно отсекалось (для этого остаётся мягкий −40 в scoreCreativeIdea).
 */
export function ideaProposesForbiddenItem(idea: IdeatorIdea, forbiddenItems: string[] | undefined): boolean {
  const forbidden = (forbiddenItems ?? []).map((s) => normalizeText(s).trim()).filter((s) => s.length > 2);
  if (!forbidden.length) return false;
  const itemsText = normalizeText((idea.items ?? []).map((i) => `${i.productType} ${i.notes ?? ''}`).join(' '));
  return forbidden.some((f) => itemsText.includes(f));
}

export function pickTopCreativeIdeasLocally(
  ideas: IdeatorIdea[],
  brief: AgentBriefContext,
  limit: number,
): CriticOutput {
  const byTitle = new Map(ideas.map((i) => [i.title, i]));

  // ЖЁСТКИЙ ОТСЕВ ЗАПРЕТОВ. Раньше forbiddenItems для креатива обнулялись на границе брифа, и этот
  // канал был мёртвым кодом. Если запрет отсёк ВСЁ — значит модель проигнорировала ограничение
  // целиком; тогда не роняем прогон в ноль (mustAvoid всё равно уедет в промпт картинки), а идём
  // по мягкому скору (−40 уже утопил такие идеи в самый низ).
  const clean = ideas.filter((i) => !ideaProposesForbiddenItem(i, brief.forbiddenItems));
  const pool = clean.length ? clean : ideas;

  const ranked = pool
    .map((idea) => {
      const score = scoreCreativeIdea(idea, brief);
      return {
        title: idea.title,
        score,
        briefFitScore: score,
        conceptSummary: [idea.hook, idea.description, idea.whyItFits]
          .filter(Boolean)
          .join(' ')
          .slice(0, 500),
        reasons: [idea.whyItFits || 'Соответствует брифу и структуре набора'],
        risks: [] as string[],
        suggestedEdits: [] as string[],
      };
    })
    .sort((a, b) => b.score - a.score);

  const top: CriticTopIdea[] = [];
  for (const candidate of ranked) {
    if (top.length >= limit) break;
    if (!byTitle.has(candidate.title)) continue;
    if (top.some((t) => titlesTooSimilar(t.title, candidate.title))) continue;
    top.push(candidate);
  }

  for (const candidate of ranked) {
    if (top.length >= limit) break;
    if (top.some((t) => t.title === candidate.title)) continue;
    top.push(candidate);
  }

  return { topIdeas: top.slice(0, limit) };
}
