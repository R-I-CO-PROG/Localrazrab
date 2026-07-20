/** Извлекает сумму в рублях из фрагмента текста (цифры, млн, миллион, тыс.) */
export function parseRussianMoneyAmount(fragment: string): number | null {
  const raw = String(fragment ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
  if (!raw) return null;

  const mlnWithNum = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:млн|million)/i);
  if (mlnWithNum) {
    const base = Number.parseFloat(mlnWithNum[1].replace(',', '.'));
    if (Number.isFinite(base) && base > 0) return Math.round(base * 1_000_000);
  }

  const mlnWordWithNum = raw.match(/(\d+(?:[.,]\d+)?)\s+(?:миллион|миллиона|миллионов)/i);
  if (mlnWordWithNum) {
    const base = Number.parseFloat(mlnWordWithNum[1].replace(',', '.'));
    if (Number.isFinite(base) && base > 0) return Math.round(base * 1_000_000);
  }

  if (/^(?:миллион|миллиона|миллионов)$/i.test(raw) || (/миллион/i.test(raw) && !/\d/.test(raw))) {
    return 1_000_000;
  }
  if (/^полмиллиона$/i.test(raw) || /полмиллиона/i.test(raw)) return 500_000;

  const tysWithNum = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:тыс|тысяч)/i);
  if (tysWithNum) {
    const base = Number.parseFloat(tysWithNum[1].replace(',', '.'));
    if (Number.isFinite(base) && base > 0) return Math.round(base * 1_000);
  }

  const digits = raw.match(/(\d[\d\s]*(?:[.,]\d+)?)/);
  if (digits) {
    const normalized = digits[1].replace(/\s/g, '').replace(',', '.');
    const n = Number.parseFloat(normalized);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }

  return null;
}

export type BudgetScope = 'per_set' | 'total';

/** per_set = бюджет на один набор; total = общий бюджет проекта / тиража */
export function inferBudgetScope(text: string, amount: number): BudgetScope {
  const lower = String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е');

  // Явный признак per-set: за штуку/шт, за набор/комплект/подарок, на человека/сотрудника.
  if (
    /на\s+(?:один\s+)?(?:набор|комплект|подарок|сет)|за\s+(?:набор|комплект|подарок|штук|шт(?![а-я])|единиц|1\b)|\/\s*шт|на\s+комплект|бюджет\s+набор|на\s+(?:челов|сотрудник|персон|гост|участник)|per\s+set|per\s+item|за\s+единиц/i.test(
      lower,
    )
  ) {
    return 'per_set';
  }
  // Явный признак total.
  if (/общ(ий|его)|всего\s+бюджет|бюджет\s+проект|на\s+(?:весь\s+)?проект|на\s+тираж|на\s+зака[зж]|на\s+вс[её]|итого|total\s+budget/i.test(lower)) {
    return 'total';
  }
  if (
    /\d+\s*(?:предмет|позици|товар)|подарк|vip|премиальн/i.test(lower) &&
    amount < 200_000
  ) {
    return 'per_set';
  }
  // Одиночная сумма при указанном тираже — трактуем как per-set (не делим на тираж).
  if (/тираж|\d+\s*(?:шт|штук|набор|комплект|подарк|человек|сотрудник)/i.test(lower) && amount < 200_000) {
    return 'per_set';
  }
  if (amount >= 200_000) return 'total';
  return 'per_set';
}
