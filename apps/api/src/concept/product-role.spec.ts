import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import { detectProductRole, isGiftBundleProduct } from './product-role.util';
import {
  typeConflictsInSet,
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
  detectPrimaryTypeFromName,
} from '../providers/llm/concept-diversity.util';
import { parseItemCountBounds } from '../providers/llm/parse-desired-count';
import { extractBriefForbiddenColorHints } from '../requests/brief-color-palette.util';
import { productHasForbiddenColor } from '../providers/llm/catalog-color-match.util';
import { productVariantKey } from '../providers/llm/catalog-variant.util';
import { resolveBudgetPerSet } from '../providers/llm/set-budget.util';
import { briefPrefersWarmColors } from '../requests/parse-brief.util';

function mock(overrides: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'name'>): CatalogProduct {
  return {
    category: 'Подарки',
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/p.jpg',
    ...overrides,
  };
}

describe('detectProductRole', () => {
  it('classifies welcome pack', () => {
    const role = detectProductRole(
      mock({ id: '1', name: 'Welcome pack «Simple kit», синий' }),
    );
    assert.equal(role.role, 'welcome_pack');
    assert.equal(role.isGiftBundle, true);
  });

  it('classifies gift set bundles', () => {
    const role = detectProductRole(
      mock({ id: '2', name: 'Подарочный набор с пледом, термокружкой и чаем, синий' }),
    );
    assert.equal(role.role, 'gift_set');
  });

  it('classifies notebook before bag', () => {
    const role = detectProductRole(
      mock({
        id: '3',
        name: 'Блокнот "Wood" с ручкой в ореховом магнитном пенале',
        category: 'Сумки',
      }),
    );
    assert.equal(role.role, 'notebook');
    assert.equal(role.legacyType, 'notebook');
  });

  it('classifies thermos mug as drinkware', () => {
    const role = detectProductRole(mock({ id: '4', name: 'Термокружка Steel 350, серый' }));
    assert.equal(role.role, 'drinkware');
  });

  it('detects gift bundle helper', () => {
    assert.equal(
      isGiftBundleProduct(mock({ id: '5', name: 'Набор Superbag Bubble (белый)' })),
      true,
    );
    assert.equal(isGiftBundleProduct(mock({ id: '6', name: 'Ручка металлическая' })), false);
  });

  it('classifies blanket in bag packaging as blanket', () => {
    const names = [
      'Плед Арго',
      'Плед для пикника Monaco',
      'Плед-подушка Вояж',
      'Плед в полоску в сумке Junket',
    ];
    for (const name of names) {
      const role = detectProductRole(mock({ id: `b-${name}`, name }));
      assert.equal(role.legacyType, 'blanket', `expected blanket for "${name}", got ${role.legacyType}`);
      assert.equal(detectConceptProductType(mock({ id: `b2-${name}`, name })), 'blanket');
    }
  });

  it('classifies notebook with pen as notebook not bag', () => {
    const role = detectProductRole(
      mock({ id: 'nb1', name: 'Блокнот Wood с ручкой', category: 'Сумки' }),
    );
    assert.equal(role.legacyType, 'notebook');
    assert.equal(detectPrimaryTypeFromName('блокнот wood с ручкой'), 'notebook');
  });

  it('does not classify fitness set as gift_set', () => {
    const role = detectProductRole(mock({ id: 'f1', name: 'Набор для фитнеса Cross' }));
    assert.notEqual(role.role, 'gift_set');
  });

  it('collapses color variants to same productVariantKey', () => {
    const a = mock({ id: 'v1', name: 'Набор для фитнеса Cross, оранжевый' });
    const b = mock({ id: 'v2', name: 'Набор для фитнеса Cross, серый' });
    assert.equal(productVariantKey(a), productVariantKey(b));
  });

  it('detects mandatory thermos and blanket from cozy brief', () => {
    const brief =
      'Набор мерча для благодарности арендаторам зимой. ОБЯЗАТЕЛЬНЫ предметы: термос и плед.';
    const types = detectMandatoryConceptTypesFromBrief(brief);
    assert.ok(types.includes('thermos'));
    assert.ok(types.includes('blanket'));
  });

  it('resolveBudgetPerSet uses 2500 per-set cap', () => {
    assert.equal(resolveBudgetPerSet(1500, 2500), 2500);
  });

  it('brief prefers warm colors palette', () => {
    assert.equal(
      briefPrefersWarmColors('Предпочтение тёплым цветовым гаммам'),
      true,
    );
  });

  it('typeConflictsInSet treats mug and bottle as drinkware family', () => {
    const types = new Set(['mug']);
    assert.equal(typeConflictsInSet(types, 'bottle'), true);
    assert.equal(typeConflictsInSet(types, 'thermos'), true);
  });

  it('parseItemCountBounds reads minimum 5 items', () => {
    const bounds = parseItemCountBounds('IT-конференция. Минимум 5 предметов в наборе.');
    assert.ok(bounds);
    assert.equal(bounds!.min, 5);
  });

  it('forbidden color hints block black product on new year brief', () => {
    const brief = 'Новогодний набор. Запрещены чёрный и серый.';
    const hints = extractBriefForbiddenColorHints(brief);
    const product = mock({ id: 'blk', name: 'Кружка чёрная', description: 'черная кружка' });
    assert.ok(productHasForbiddenColor(product, hints));
  });
});
