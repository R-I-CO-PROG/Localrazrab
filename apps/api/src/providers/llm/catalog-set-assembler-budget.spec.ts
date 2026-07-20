import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assembleFromPool } from './catalog-set-assembler.util';
import { estimateSetTotalPrice, resolveSetBudgetRange } from './set-budget.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price: number): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 500, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

/** Разнокатегорийный пул: у каждой категории есть дешёвый и дорогой вариант. */
function richPool(): CatalogProduct[] {
  const cats = [
    ['Кружки', 'Кружка'],
    ['Ежедневники и блокноты', 'Блокнот'],
    ['Сумки и рюкзаки', 'Рюкзак'],
    ['Электроника', 'Пауэрбанк'],
    ['Зонты', 'Зонт'],
    ['Отдых и спорт', 'Плед'],
    ['Ручки', 'Ручка'],
  ];
  const out: CatalogProduct[] = [];
  cats.forEach(([cat, base], i) => {
    out.push(prod(`${base}-cheap-${i}`, `${base} эконом ${i}`, cat, 500));
    out.push(prod(`${base}-mid-${i}`, `${base} стандарт ${i}`, cat, 2200));
    out.push(prod(`${base}-prem-${i}`, `${base} премиум ${i}`, cat, 4200));
  });
  return out;
}

describe('assembleFromPool: полнота набора и освоение бюджета', () => {
  beforeEach(() => clearProductTypeCache());

  it('VIP-бюджет: набор набирает целевое число позиций и осваивает ≥ floor', () => {
    const pool = richPool();
    const budgetPerSet = 20000;
    const { floor, cap } = resolveSetBudgetRange(null, budgetPerSet);

    const out = assembleFromPool({
      pool,
      productIds: null, // детерминированная сборка (эмулируем слабого байера)
      ledger: ledger(),
      minItems: 3,
      maxItems: 5,
      budgetPerSet,
      brief: 'премиальный VIP-набор для партнёров',
      brandColors: [],
      fullCatalog: pool,
    });

    const total = estimateSetTotalPrice(out);
    assert.ok(out.length >= 5, `ожидали ≥5 позиций, получили ${out.length}`);
    assert.ok(total <= cap, `сумма ${total} должна быть ≤ cap ${cap}`);
    assert.ok(total >= floor, `сумма ${total} должна осваивать ≥ floor ${floor}`);
  });

  it('байер вернул 2 позиции — сборщик добирает до maxItems', () => {
    const pool = richPool();
    const out = assembleFromPool({
      pool,
      productIds: ['Кружка-mid-0', 'Блокнот-mid-1'],
      ledger: ledger(),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 15000,
      brief: 'набор для команды',
      brandColors: [],
      fullCatalog: pool,
    });
    assert.ok(out.length >= 5, `тонкий выбор байера должен дорасти до 5, получили ${out.length}`);
  });
});
