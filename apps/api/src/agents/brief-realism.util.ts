/** Штраф за «гаджетные» идеи, когда бриф не просит инноваций */
const GIMMICK_PATTERNS: RegExp[] = [
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

const TRANSPORT_BRIEF =
  /транспорт|доставк|логист|fleet|фур|грузов|фургон|авто|машин|vehicle|truck|van|delivery|shipping/i;

export function briefAllowsFuturism(brief: string): boolean {
  return FUTURISM_BRIEF.test(brief);
}

export function briefSuggestsTransport(brief: string): boolean {
  return TRANSPORT_BRIEF.test(brief);
}

/** Чем выше — тем более «гаджетная» идея относительно брифа */
export function gimmickPenalty(text: string, brief: string): number {
  if (briefAllowsFuturism(brief)) return 0;

  let penalty = 0;
  for (const pattern of GIMMICK_PATTERNS) {
    if (pattern.test(text)) penalty += 18;
  }

  if (briefSuggestsTransport(brief) && penalty > 0) {
    penalty += 12;
  }

  return Math.min(penalty, 55);
}

export function realismBoost(text: string, brief: string): number {
  if (!briefSuggestsTransport(brief)) return 0;

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
    if (pattern.test(text)) boost += 8;
  }
  return Math.min(boost, 24);
}

export function adjustedBriefFitScore(
  baseScore: number,
  ideaText: string,
  brief: string,
): number {
  const adjusted =
    baseScore - gimmickPenalty(ideaText, brief) + realismBoost(ideaText, brief);
  return Math.max(0, Math.min(100, Math.round(adjusted)));
}
