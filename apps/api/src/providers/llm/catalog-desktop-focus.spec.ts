import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBriefRelevanceContext,
  scoreBriefRelevanceWithContext,
} from './catalog-brief-relevance.util';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: category, description: '', price: 1200,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('«настольное» = desk-tech, переносное не настольное (прогон 3:14)', () => {
  const ctx = buildBriefRelevanceContext('подарок IT-сотрудникам, что-то настольное, технологичное, до 3000', []);

  it('desktopFocus активен', () => {
    assert.equal(ctx.flags.desktopFocus, true);
  });

  it('настольные гаджеты (подставка/лампа/хаб/метеостанция) — в плюс', () => {
    for (const n of ['Подставка для телефона', 'Настольная лампа с беспроводной зарядкой', 'USB-хаб 4 порта', 'Метеостанция настольная', 'Настольный органайзер деревянный']) {
      assert.ok(scoreBriefRelevanceWithContext(p(n, 'Электроника'), ctx) > 20, `${n} должен быть в плюс`);
    }
  });

  it('переносное (рюкзак/папка/флешка/клатч/сумка) — жёстко режется (negative)', () => {
    for (const [n, c] of [
      ['Рюкзак-трансформер для ноутбука', 'Сумки и рюкзаки'],
      ['Папка для документов Kadeo', 'Ежедневники'],
      ['USB-флешка 64 ГБ Type-C', 'Электроника и гаджеты'],
      ['Клатч-органайзер Turner', 'Сумки и рюкзаки'],
      ['Поясная сумка SPIRIT', 'Сумки и рюкзаки'],
    ] as const) {
      assert.ok(scoreBriefRelevanceWithContext(p(n, c), ctx) < 0, `${n} должен быть отрицательным (не настольное)`);
    }
  });

  it('флешка — тех, но НЕ настольная → режется', () => {
    assert.ok(scoreBriefRelevanceWithContext(p('Флешка 64 ГБ USB Type-C «Индата»', 'Электроника и гаджеты'), ctx) < 0);
  });

  it('на НЕ-настольном брифе переносное НЕ режется (desktopFocus off)', () => {
    const office = buildBriefRelevanceContext('welcome-набор новым сотрудникам', []);
    assert.equal(office.flags.desktopFocus, false);
    assert.ok(scoreBriefRelevanceWithContext(p('Рюкзак городской', 'Сумки'), office) >= 0);
  });
});
