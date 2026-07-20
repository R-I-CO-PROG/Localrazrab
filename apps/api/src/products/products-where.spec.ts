import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductWhere } from './products-where';

describe('buildProductWhere', () => {
  it('без фильтров — пустой where', () => {
    assert.deepEqual(buildProductWhere(), {});
    assert.deepEqual(buildProductWhere({}), {});
  });

  it('только категория', () => {
    const w = buildProductWhere({ category: 'Ручки' }) as { AND: unknown[] };
    assert.equal(w.AND.length, 1);
    assert.deepEqual(w.AND[0], {
      OR: [{ category: 'Ручки' }, { subcategory: { contains: 'Ручки', mode: 'insensitive' } }],
    });
  });

  it('только поиск: имя ИЛИ точный артикул', () => {
    const w = buildProductWhere({ search: 'кружка' }) as { AND: Array<{ OR: unknown[] }> };
    assert.deepEqual(w.AND[0].OR, [
      { name: { contains: 'кружка', mode: 'insensitive' } },
      { externalId: { equals: 'кружка', mode: 'insensitive' } },
    ]);
  });

  it('артикул oasis находится точным совпадением', () => {
    const w = buildProductWhere({ search: '514209' }) as { AND: Array<{ OR: Array<Record<string, unknown>> }> };
    assert.deepEqual(w.AND[0].OR[1], { externalId: { equals: '514209', mode: 'insensitive' } });
  });

  it('РЕГРЕССИЯ: категория и поиск вместе не затирают друг друга', () => {
    const w = buildProductWhere({ category: 'Кружки', search: 'Corvus' }) as { AND: unknown[] };
    assert.equal(w.AND.length, 2, 'обе группы условий должны выжить');
  });

  it('пробельный поиск игнорируется', () => {
    assert.deepEqual(buildProductWhere({ search: '   ' }), {});
  });
});
