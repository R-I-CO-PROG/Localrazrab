import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreConceptCoherence,
  COHERENCE_BONUS,
  COHERENCE_PENALTY,
} from './catalog-context-scoring.util';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: name, price: 900,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('Фикс регресса связности (coherence): узкие анти-списки, одежда не под запретом', () => {
  it('одежда (худи) НЕ штрафуется в рабочей концепции (был −55, крупнейшая категория каталога)', () => {
    // «Рабочий настрой» триггерит office; у office больше нет анти-списка → одежда не режется.
    assert.ok(
      scoreConceptCoherence(p('Худи с вышивкой логотипа', 'Одежда'), 'Рабочий настрой', 'подарок команде') >= 0,
    );
  });

  it('куртка/зонт/плед НЕ штрафуются в «тёплом корпоративе» (были −55)', () => {
    const t = 'Тёплый корпоратив для сотрудников';
    const c = 'подарок команде за отличную работу';
    assert.ok(scoreConceptCoherence(p('Куртка-ветровка софтшелл', 'Одежда'), t, c) >= 0);
    assert.ok(scoreConceptCoherence(p('Зонт-трость автомат', 'Зонты'), t, c) >= 0);
    // Плед в тёплой теме даже В ТЕМУ (cozy: «тёпл») — положительный.
    assert.ok(scoreConceptCoherence(p('Плед флисовый', 'Пледы'), t, c) > 0);
  });

  it('рюкзак в «уюте у камина» — нейтрален (0), а не −55', () => {
    assert.equal(
      scoreConceptCoherence(p('Рюкзак городской', 'Сумки и рюкзаки'), 'Уютный вечер у камина', 'плед и чай'),
      0,
    );
  });

  it('рюкзак/дождевик/термос НА ПРИРОДЕ — В ТЕМУ (была отдельная ось outdoor)', () => {
    const t = 'Пикник на природе';
    const c = 'выезд за город на свежий воздух';
    assert.equal(scoreConceptCoherence(p('Рюкзак туристический', 'Сумки и рюкзаки'), t, c), COHERENCE_BONUS);
    assert.equal(scoreConceptCoherence(p('Дождевик-плащ', 'Одежда'), t, c), COHERENCE_BONUS);
    assert.equal(scoreConceptCoherence(p('Термос вакуумный 1л', 'Термосы и бутылки'), t, c), COHERENCE_BONUS);
  });

  it('тематичный staple получает +bonus (плед в уюте, ежедневник в офисе)', () => {
    assert.equal(scoreConceptCoherence(p('Плед флисовый', 'Пледы'), 'Уютный вечер', 'дома с чаем'), COHERENCE_BONUS);
    assert.equal(scoreConceptCoherence(p('Ежедневник недатированный', 'Ежедневники'), 'Рабочий кабинет', 'офис'), COHERENCE_BONUS);
  });

  it('premium: дёшево-пластиковая сувенирка режется (единственный сохранённый анти-кейс)', () => {
    const s = scoreConceptCoherence(p('Брелок пластиковый промо', 'Прочее'), 'Премиум-набор для партнёров', 'статусный подарок');
    assert.equal(s, COHERENCE_PENALTY);
    assert.ok(s < 0);
  });

  it('но одежда/кожа в премиуме НЕ режется (не в анти)', () => {
    assert.ok(
      scoreConceptCoherence(p('Худи премиум хлопок', 'Одежда'), 'Премиум-набор для партнёров', 'статус') >= 0,
    );
  });

  it('концепция без явной темы — coherence 0 (обычные наборы не трогаем)', () => {
    assert.equal(scoreConceptCoherence(p('Рюкзак городской', 'Сумки'), 'Набор для новых сотрудников', 'welcome pack'), 0);
  });

  it('штраф смягчён с −55 до −25', () => {
    assert.equal(COHERENCE_PENALTY, -25);
  });
});
