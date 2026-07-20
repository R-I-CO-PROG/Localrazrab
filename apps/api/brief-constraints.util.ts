const CLOTHING_WANT_KEYS = [
  'одежд',
  'футбол',
  'худи',
  'кепк',
  'поло',
  'свитшот',
  'мерч',
  'apparel',
  'clothing',
  'wear',
  'брендированн',
  'тиш',
  'tshirt',
  't-shirt',
  'hoodie',
];

const CLOTHING_FORBID_KEYS = [
  'без одежд',
  'не одежд',
  'no clothing',
  'без футбол',
  'без мерч',
  'без худи',
  'без кепк',
];

export interface ReconciledBriefConstraints {
  allowedItems: string[];
  forbiddenItems: string[];
  forbiddenMaterials: string[];
  qualityFloor: 'premium' | 'standard' | null;
}

export function briefRequestsClothing(text: string): boolean {
  const lower = String(text ?? '').toLowerCase();
  if (CLOTHING_FORBID_KEYS.some((k) => lower.includes(k))) return false;
  return CLOTHING_WANT_KEYS.some((k) => lower.includes(k));
}

export function briefForbidsClothing(text: string): boolean {
  const lower = String(text ?? '').toLowerCase();
  return CLOTHING_FORBID_KEYS.some((k) => lower.includes(k));
}

function parseForbiddenMaterials(text: string): string[] {
  const lower = String(text ?? '').toLowerCase().replace(/ё/g, 'е');
  const found = new Set<string>();

  if (/нельзя\s+пластик|без\s+пластик|не\s+использ\w*\s+пластик|no\s+plastic/i.test(lower)) {
    found.add('plastic');
  }
  if (/одноразов|disposable|не\s+однораз/i.test(lower) && /нельзя|без|запрещ|не\s+использ/i.test(lower)) {
    found.add('disposable');
  }
  if (/многоразов\w*\s+пластик|пластиков\w*\s+издел|reusable\s+plastic/i.test(lower)) {
    found.add('plastic_reusable');
  }

  return [...found];
}

function parseQualityFloor(text: string, budgetMax?: number | null): 'premium' | 'standard' | null {
  const lower = String(text ?? '').toLowerCase().replace(/ё/g, 'е');
  if (/vip|премиум|premium|luxury|роскошн|эксклюзив|элит|executive|ювелир/i.test(lower)) {
    return 'premium';
  }
  if (budgetMax != null && budgetMax >= 6000) return 'premium';
  if (/бюджетн|дешев|массов|economy|cheap/i.test(lower)) return 'standard';
  return null;
}

/** Согласовать «можно / нельзя» с текстом брифа (одежда, материалы, качество) */
export function reconcileBriefConstraints(
  userPrompt: string,
  allowedItems: string[],
  forbiddenItems: string[],
  budgetMax?: number | null,
): ReconciledBriefConstraints {
  let allowed = [...allowedItems];
  let forbidden = [...forbiddenItems];

  if (briefRequestsClothing(userPrompt)) {
    forbidden = forbidden.filter((f) => f !== 'Одежда');
    if (!allowed.includes('Текстиль')) allowed.push('Текстиль');
  } else if (briefForbidsClothing(userPrompt)) {
    if (!forbidden.includes('Одежда')) forbidden.push('Одежда');
  }

  if (/многоразов\w*\s+пластик|пластиков\w*\s+издел|reusable\s+plastic/i.test(userPrompt)) {
    if (!forbidden.includes('Пластиковые многоразовые')) {
      forbidden.push('Пластиковые многоразовые');
    }
  }

  const forbiddenMaterials = parseForbiddenMaterials(userPrompt);
  const qualityFloor = parseQualityFloor(userPrompt, budgetMax);

  if (qualityFloor === 'premium' && /массов|дешев|cheap|массмаркет/i.test(userPrompt)) {
    forbiddenMaterials.push('mass_market');
  }

  return {
    allowedItems: [...new Set(allowed)],
    forbiddenItems: [...new Set(forbidden)],
    forbiddenMaterials: [...new Set(forbiddenMaterials)],
    qualityFloor,
  };
}

export function productViolatesMaterialBan(
  productName: string,
  description: string,
  category: string,
  forbiddenMaterials: string[],
): boolean {
  if (!forbiddenMaterials.length) return false;
  const text = `${productName} ${description} ${category}`.toLowerCase().replace(/ё/g, 'е');

  for (const mat of forbiddenMaterials) {
    if (mat === 'plastic' && /пластик|пластмасс|plastic|polypropylene|pp\b|abs\b|полиэстер/i.test(text)) {
      return true;
    }
    if (mat === 'plastic_reusable' && /фляг|flask|пластиков\w*\s+бутыл|многоразов\w*\s+стакан/i.test(text)) {
      return true;
    }
    if (mat === 'disposable' && /одноразов|disposable|бумажн\w*\s+стакан|пластиков\w*\s+стакан/i.test(text)) {
      return true;
    }
    if (mat === 'mass_market' && /стикер|брелок|бейдж|обвес|наклейк/i.test(text)) {
      return true;
    }
  }
  return false;
}
