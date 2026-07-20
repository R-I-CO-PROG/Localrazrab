/** Ключ типа товара для проверки дубликатов в наборе (зеркало API concept-diversity) */
export function detectProductTypeKey(name: string, category = ""): string {
  const t = `${name} ${category}`.toLowerCase().replace(/ё/g, "е");

  if (/чайн[а-я]*\s*пар/.test(t)) return "tea_set";
  if (/термокруж/.test(t)) return "thermos_mug";
  if (/термос/.test(t)) return "thermos";
  if (/бутыл/.test(t)) return "bottle";
  if ((/круж|стакан|mug|cup|бамбуков/.test(t)) && !/термос|бутыл|чайн/.test(t)) return "mug";
  if (/ежедневник/.test(t)) return "diary";
  if (/блокнот/.test(t)) return "notebook";
  if (/рюкзак|backpack/.test(t)) return "backpack";
  if (/шоппер/.test(t)) return "shopper";
  if (/сумк|тоут|tote/.test(t) && !/рюкзак|шоппер/.test(t)) return "bag";
  if (/колонк|speaker|bluetooth/.test(t)) return "speaker";
  if (/плед|полотен/.test(t)) return "blanket";
  if (/powerbank|power bank|пауэр|зарядн|аккумулятор|мач|mah/.test(t)) return "powerbank";
  if (/ручк|pen/.test(t) && !/powerbank/.test(t)) return "pen";
  if (/флеш|usb|flash/.test(t) && !/powerbank|заряд|аккумулятор|мач|mah/.test(t)) return "flash";
  if (/зонт/.test(t)) return "umbrella";
  if (/час/.test(t) && !/powerbank/.test(t)) return "watch";

  return `cat:${category.toLowerCase().replace(/\s+/g, "_") || "other"}`;
}

export function setHasProductType(
  items: Array<{ name: string; description?: string }>,
  candidateName: string,
  candidateCategory = "",
): boolean {
  const key = detectProductTypeKey(candidateName, candidateCategory);
  return items.some((it) => detectProductTypeKey(it.name, it.description ?? "") === key);
}
