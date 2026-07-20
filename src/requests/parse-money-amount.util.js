"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRussianMoneyAmount = parseRussianMoneyAmount;
exports.inferBudgetScope = inferBudgetScope;
function parseRussianMoneyAmount(fragment) {
    const raw = String(fragment ?? '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е');
    if (!raw)
        return null;
    const mlnWithNum = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:млн|million)/i);
    if (mlnWithNum) {
        const base = Number.parseFloat(mlnWithNum[1].replace(',', '.'));
        if (Number.isFinite(base) && base > 0)
            return Math.round(base * 1_000_000);
    }
    const mlnWordWithNum = raw.match(/(\d+(?:[.,]\d+)?)\s+(?:миллион|миллиона|миллионов)/i);
    if (mlnWordWithNum) {
        const base = Number.parseFloat(mlnWordWithNum[1].replace(',', '.'));
        if (Number.isFinite(base) && base > 0)
            return Math.round(base * 1_000_000);
    }
    if (/^(?:миллион|миллиона|миллионов)$/i.test(raw) || (/миллион/i.test(raw) && !/\d/.test(raw))) {
        return 1_000_000;
    }
    if (/^полмиллиона$/i.test(raw) || /полмиллиона/i.test(raw))
        return 500_000;
    const tysWithNum = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:тыс|тысяч)/i);
    if (tysWithNum) {
        const base = Number.parseFloat(tysWithNum[1].replace(',', '.'));
        if (Number.isFinite(base) && base > 0)
            return Math.round(base * 1_000);
    }
    const digits = raw.match(/(\d[\d\s]*(?:[.,]\d+)?)/);
    if (digits) {
        const normalized = digits[1].replace(/\s/g, '').replace(',', '.');
        const n = Number.parseFloat(normalized);
        if (Number.isFinite(n) && n > 0)
            return Math.round(n);
    }
    return null;
}
function inferBudgetScope(text, amount) {
    const lower = String(text ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е');
    if (/на\s+(?:один\s+)?(?:набор|комплект|подарок|сет)|за\s+набор|на\s+комплект|бюджет\s+набор|per\s+set/i.test(lower)) {
        return 'per_set';
    }
    if (/\d+\s*(?:предмет|позици|товар)|подарк|vip|премиальн/i.test(lower) &&
        amount < 200_000) {
        return 'per_set';
    }
    if (/общ(ий|его)|всего|на\s+проект|на\s+тираж|на\s+заказ|total\s+budget/i.test(lower)) {
        return 'total';
    }
    if (amount >= 200_000)
        return 'total';
    return 'per_set';
}
//# sourceMappingURL=parse-money-amount.util.js.map