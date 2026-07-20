import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enforceSetHardConstraints,
  effectiveBudgetCap,
  type SelectionConstraintsInput,
} from './selection-constraints';
import { estimateSetTotalPrice } from '../providers/llm/set-budget.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';

/**
 * Терминальный гейт бюджета умел ТОЛЬКО удалять лишнее:
 *   `while (kept.length > minProductsPerSet && total > cap)`
 * Когда в наборе ровно `min` предметов, цикл не выполняется ни разу — и набор уезжает
 * пользователю дороже бюджета. Классический fail-open.
 *
 * Реальный прогон тестера 2026-07-10 16:06, бриф «подарки врачам», бюджет 800–3000 ₽:
 *   «Энергия до последней встречи» = наушники 2243 + плед 1977 + кружка 655 = 4875 ₽
 *   (3 товара при min=3 → кламп бессилен, превышение на 62%).
 *
 * Правильное поведение байера: ЗАМЕНИТЬ самую дорогую позицию на более дешёвую из каталога.
 * Удаление ниже минимума — крайняя мера, когда замены нет: бюджет клиента жёстче, чем наш
 * дефолтный минимум в 3 предмета.
 */

let seq = 0;
function mk(name: string, opts: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: opts.id ?? `p${++seq}`,
    name,
    category: opts.category ?? 'Прочее',
    subcategory: '',
    description: '',
    price: opts.price ?? 800,
    stockAvailable: opts.stockAvailable ?? 5000,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/x.jpg',
    imageUrl: 'https://cdn.example.com/x.jpg',
    ...opts,
  } as CatalogProduct;
}

function input(over: Partial<SelectionConstraintsInput> = {}): SelectionConstraintsInput {
  return {
    userPrompt: 'подарки врачам на день медицинского работника',
    budgetPerSet: 3000,
    quantity: 0,
    minProductsPerSet: 3,
    maxProductsPerSet: 5,
    colors: [],
    allowedItems: [],
    forbiddenItems: [],
    ...over,
  };
}

/** Тот же потолок, что применяет гейт (бюджет + штатный допуск). */
const CAP = effectiveBudgetCap(3000);

describe('бюджет: набор из ровно min предметов не может уехать дороже потолка', () => {
  const headphones = () => mk('Наушники Rombica MySound Free Pro', { id: 'h1', price: 2243, category: 'Электроника' });
  const blanket = () => mk('Плед акриловый Chain, молочный', { id: 'b1', price: 1977, category: 'Отдых и спорт' });
  const mug = () => mk('Керамическая кружка Moni 430 мл', { id: 'm1', price: 655, category: 'Кружки' });

  it('дорогая позиция заменяется на дешёвый аналог, размер набора сохраняется', () => {
    const set = [headphones(), blanket(), mug()];
    const pool = [
      ...set,
      mk('Наушники TWS Buds, черные', { id: 'h2', price: 690, category: 'Электроника' }),
      mk('Плед флисовый Copy, зеленый', { id: 'b2', price: 756, category: 'Отдых и спорт' }),
    ];
    const res = enforceSetHardConstraints(set, input(), pool);
    const total = estimateSetTotalPrice(res.set);
    assert.ok(total <= CAP, `набор стоит ${total}₽ при потолке 3000₽ (+15%)`);
    assert.equal(res.set.length, 3, 'заменяем, а не выкидываем');
  });

  it('замены нет → лучше меньше предметов, чем превышение бюджета', () => {
    const set = [headphones(), blanket(), mug()];
    const res = enforceSetHardConstraints(set, input(), set);
    const total = estimateSetTotalPrice(res.set);
    assert.ok(total <= CAP, `набор стоит ${total}₽ — бюджет клиента жёстче нашего минимума в 3 предмета`);
  });

  it('набор в бюджете не трогается', () => {
    const set = [
      mk('Ежедневник А5', { price: 450, category: 'Ежедневники и блокноты' }),
      mk('Ручка шариковая', { price: 200, category: 'Ручки' }),
      mk('Кружка керамическая', { price: 350, category: 'Кружки' }),
    ];
    const res = enforceSetHardConstraints(set, input(), set);
    assert.equal(res.set.length, 3);
    assert.equal(res.removed.filter((r) => r.code === 'budget_exceeded').length, 0);
  });

  // Найдено состязательным ревью: своп обязан проходить те же гейты, что и обычный добор,
  // иначе он втащит товар без тиража или занятый другим набором.
  it('замена не берёт товар с недостаточным остатком под тираж', () => {
    const set = [headphones(), blanket(), mug()];
    const pool = [
      ...set,
      mk('Наушники дешёвые, остатка нет', { id: 'h3', price: 690, category: 'Электроника', stockAvailable: 5 }),
      mk('Плед флисовый Copy', { id: 'b2', price: 756, category: 'Отдых и спорт', stockAvailable: 5000 }),
    ];
    const res = enforceSetHardConstraints(set, input({ quantity: 500 }), pool);
    assert.ok(!res.set.some((p) => p.id === 'h3'), 'товар с остатком 5 при тираже 500 не должен попасть в набор');
  });

  it('замена уважает реестр занятых товаров (кросс-концептная уникальность)', () => {
    const set = [headphones(), blanket(), mug()];
    const cheapHeadphones = mk('Наушники TWS Buds', { id: 'h2', price: 690, category: 'Электроника' });
    const pool = [...set, cheapHeadphones, mk('Плед флисовый Copy', { id: 'b2', price: 756, category: 'Отдых и спорт' })];
    // Реестр: h2 уже занят другим набором.
    const ledger = {
      canUse: (p: CatalogProduct) => p.id !== 'h2',
      reserve: () => {},
      release: () => {},
    } as unknown as Parameters<typeof enforceSetHardConstraints>[3]['ledger'];
    const res = enforceSetHardConstraints(set, input(), pool, { ledger });
    assert.ok(!res.set.some((p) => p.id === 'h2'), 'занятый другим набором товар не должен быть подставлен');
  });

  it('обязательную позицию не заменяем и не выкидываем даже ради бюджета', () => {
    const must = mk('Проектор портативный', { id: 'must', price: 4000, category: 'Электроника' });
    const set = [must, mk('Ручка', { price: 200, category: 'Ручки' }), mk('Кружка', { price: 300, category: 'Кружки' })];
    const res = enforceSetHardConstraints(set, input({ allowedItems: ['проектор'], userPrompt: 'набор с проектором' }), set);
    assert.ok(res.set.some((p) => p.id === 'must'), 'названная клиентом позиция обязана остаться');
  });
});
