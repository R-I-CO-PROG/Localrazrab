import type { CatalogProduct } from './catalog.util';
import { isClothingProductName } from './catalog.util';
import {
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
  mandatoryTypeAliases,
} from './concept-diversity.util';
import { reconcileBriefConstraints, productViolatesMaterialBan } from '../../requests/brief-constraints.util';

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е');
}

const FORBIDDEN_NAME_PATTERNS: Record<string, RegExp> = {
  Алкоголь: /алког|вино|виски|шампан|пив[оа]\b/i,
  Еда: /конфет|шоколад|сладост|печень|прян/i,
  Косметика: /космет|крем|парфюм|духи/i,
  'Пластиковые многоразовые': /фляг|flask|пластиков\w*\s+бутыл|многоразов\w*\s+стакан|pp\s*bottle/i,
  Одноразовое: /одноразов|disposable|бумажн\w*\s+стакан|пластиков\w*\s+тарелк/i,
  Пластик: /пластик|пластмасс|plastic|polypropylene|pp\b|abs\b/i,
  Электроника:
    /power\s*bank|пауэр|аккумулятор|зарядн|флеш|usb|flash|колонк|bluetooth|наушник|спикер/i,
};

/** Фильтр по названию товара — без опоры на категорию каталога */
export function filterCatalogByNameConstraints(
  catalog: CatalogProduct[],
  allowedItems: string[],
  forbiddenItems: string[],
  userPrompt = '',
): CatalogProduct[] {
  let filtered = [...catalog];
  const textileAllowed = allowedItems.includes('Текстиль');
  const reconciled = reconcileBriefConstraints(userPrompt, allowedItems, forbiddenItems);

  if (forbiddenItems.includes('Одежда') && !textileAllowed) {
    filtered = filtered.filter((p) => !isClothingProductName(p.name));
  }

  for (const forbidden of reconciled.forbiddenItems) {
    if (forbidden === 'Одежда') continue;

    const pattern = FORBIDDEN_NAME_PATTERNS[forbidden];
    if (pattern) {
      filtered = filtered.filter((p) => {
        const name = normalizeName(p.name);
        if (!pattern.test(name)) return true;
        if (forbidden === 'Электроника' && /очк|sunglass|eyewear/i.test(name)) return true;
        return false;
      });
    }
  }

  if (reconciled.forbiddenMaterials.length) {
    filtered = filtered.filter(
      (p) =>
        !productViolatesMaterialBan(
          p.name,
          p.description ?? '',
          p.category,
          reconciled.forbiddenMaterials,
        ),
    );
  }

  if (reconciled.qualityFloor === 'premium') {
    const premiumFiltered = filtered.filter((p) => (p.price ?? 0) >= 80 || (p.price ?? 0) === 0);
    if (premiumFiltered.length >= 8) filtered = premiumFiltered;
  }

  return filtered.length > 0 ? filtered : catalog;
}

/** Вернуть SKU обязательных по брифу типов, даже если их «категория» в каталоге неверная */
export function ensureMandatoryBriefProducts(
  fullCatalog: CatalogProduct[],
  filtered: CatalogProduct[],
  userPrompt: string,
): CatalogProduct[] {
  const mandatory = detectMandatoryConceptTypesFromBrief(userPrompt);
  if (!mandatory.length) return filtered;

  const ids = new Set(filtered.map((p) => p.id));
  const extra: CatalogProduct[] = [];

  for (const product of fullCatalog) {
    if (ids.has(product.id)) continue;
    const type = detectConceptProductType(product);
    if (mandatory.some((m) => mandatoryTypeAliases(m).includes(type))) {
      extra.push(product);
      ids.add(product.id);
    }
  }

  return extra.length ? [...filtered, ...extra] : filtered;
}
