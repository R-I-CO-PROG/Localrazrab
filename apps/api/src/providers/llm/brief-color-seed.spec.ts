import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogProduct } from './catalog.util';
import { ensureBriefColorProducts, matchesBrandColors } from './catalog-color-match.util';

/**
 * Клиент назвал цвет — в пуле обязаны быть товары этого цвета.
 *
 * Реальный прогон тестера 2026-07-10 16:10, бриф «золотая сувенирка/таппервеэр. Цвета: золотой»:
 * ни один из 14 подобранных товаров не золотой (синий, зелёный, серый меланж, чёрный, молочный).
 * При этом в боевом каталоге 536 золотых товаров в наличии, а матчер цвета исправно даёт им
 * +72…+88 балла.
 *
 * Корень: пул кандидатов набирается по ТЕМЕ («сувенирка»), цвет учитывается только позже, в
 * скоринге. Скоринг не может выбрать то, чего в пуле нет. Лечится тем же приёмом, что и
 * обязательные типы (`ensureMandatoryBriefProducts`): точечно подмешать в пул цветные товары.
 */

let seq = 0;
const mk = (name: string, colors: string[] = []): CatalogProduct =>
  ({
    id: `p${++seq}`,
    name,
    category: 'Прочее',
    subcategory: '',
    description: '',
    price: 800,
    stockAvailable: 5000,
    colors: colors.map((c) => ({ name: c, hex: null, code: null })),
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/x.jpg',
    imageUrl: 'https://cdn.example.com/x.jpg',
  }) as unknown as CatalogProduct;

describe('цвет из брифа доезжает до пула кандидатов', () => {
  const gold = () => [
    mk('Часы настольные "Sarah" XXS, золотистые'),
    mk('Ручка перьевая Pierre Cardin GOLDEN, золотистый'),
    mk('Термокружка стальная', ['золотой']),
  ];
  const offColor = () => [
    mk('Плед флисовый Copy, зеленый'),
    mk('Кружка керамическая Moni, белый'),
    mk('Ежедневник А5, синий'),
    mk('Штоф «Победный»'),
  ];

  it('в пуле нет ни одного товара нужного цвета → подмешиваем из каталога', () => {
    const filtered = offColor();
    const full = [...filtered, ...gold()];
    const out = ensureBriefColorProducts(full, filtered, ['золотой']);
    assert.ok(
      out.some((p) => matchesBrandColors(p, ['золотой'])),
      'после дозагрузки в пуле обязан быть хотя бы один золотой товар',
    );
    assert.ok(out.length > filtered.length, 'пул должен вырасти');
  });

  it('исходные кандидаты не теряются', () => {
    const filtered = offColor();
    const full = [...filtered, ...gold()];
    const out = ensureBriefColorProducts(full, filtered, ['золотой']);
    for (const p of filtered) assert.ok(out.some((x) => x.id === p.id), `потерян ${p.name}`);
  });

  it('цвет не назван → пул не трогаем', () => {
    const filtered = offColor();
    const out = ensureBriefColorProducts([...filtered, ...gold()], filtered, []);
    assert.equal(out, filtered, 'без цвета в брифе функция обязана вернуть тот же массив');
  });

  it('цветных товаров в пуле уже достаточно → ничего не подмешиваем', () => {
    const filtered = [...gold(), ...gold(), ...gold(), ...gold()]; // 12 золотых
    const out = ensureBriefColorProducts([...filtered, mk('Часы золотистые')], filtered, ['золотой']);
    assert.equal(out.length, filtered.length, 'дозагрузка не нужна');
  });

  it('дубликатов не создаём', () => {
    const filtered = [...offColor(), ...gold()];
    const out = ensureBriefColorProducts(filtered, filtered, ['золотой']);
    assert.equal(new Set(out.map((p) => p.id)).size, out.length);
  });

  it('в каталоге нет нужного цвета → возвращаем что есть, без падения', () => {
    const filtered = offColor();
    const out = ensureBriefColorProducts(filtered, filtered, ['ультрамариновый']);
    assert.equal(out.length, filtered.length);
  });

  it('порядок добора — по силе совпадения цвета', () => {
    const filtered = offColor();
    const weak = mk('Ежедневник, чёрный');
    const strong = mk('Термокружка', ['золотой']);
    const out = ensureBriefColorProducts([...filtered, weak, strong], filtered, ['золотой']);
    const added = out.slice(filtered.length);
    assert.equal(added[0]!.id, strong.id, 'самый золотой товар должен идти первым');
  });
});
