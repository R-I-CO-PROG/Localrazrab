import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreConceptThemeMatch,
  deriveAudienceNeeds,
  scoreAudienceNeedsMatch,
  scoreContextBonus,
  CONTEXT_BONUS_CAP,
  resolveAudienceArchetypes,
  pickArchetypeForConcept,
  scoreArchetypeMatch,
  ARCHETYPE_ANTI,
  ARCHETYPE_POSITIVE,
  scoreGiftWorthiness,
  GIFT_JUNK_PENALTY,
} from './catalog-context-scoring.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: name, price: 600,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('Фикс 2: тематический скоринг концепции', () => {
  it('«Эко-набор» бустит эко-товар, но НЕ дженерик-флешку', () => {
    assert.ok(scoreConceptThemeMatch(p('Сумка из переработанного хлопка', 'Сумки'), 'Эко-набор для менеджеров') > 0);
    assert.equal(scoreConceptThemeMatch(p('Флешка промо 16 Гб', 'Электроника'), 'Эко-набор для менеджеров'), 0);
  });

  it('«Премиум»/«Технологичный» бустят свои товары', () => {
    assert.ok(scoreConceptThemeMatch(p('Ручка в кожаном футляре', 'Ручки'), 'Премиум набор') > 0);
    assert.ok(scoreConceptThemeMatch(p('Беспроводная зарядка USB', 'Электроника'), 'Технологичный набор') > 0);
    // премиум-товар НЕ бустится тех-темой
    assert.equal(scoreConceptThemeMatch(p('Ручка в кожаном футляре', 'Ручки'), 'Технологичный набор'), 0);
  });

  it('5 концепций одного брифа дают РАЗЛИЧАЮЩИЙСЯ бонус одному пулу (не идентичны)', () => {
    const eco = p('Сумка из переработанного хлопка', 'Сумки');
    const tech = p('USB-хаб беспроводной', 'Электроника');
    const titles = ['Стандартный набор', 'Технологичный набор', 'Креативный набор', 'Премиум набор', 'Эко-набор'];
    const ecoScores = titles.map((t) => scoreConceptThemeMatch(eco, t));
    const techScores = titles.map((t) => scoreConceptThemeMatch(tech, t));
    // эко-сумка максимальна в «Эко», тех-хаб — в «Технологичный»: пулы концепций различаются
    assert.equal(Math.max(...ecoScores), ecoScores[4]);
    assert.equal(Math.max(...techScores), techScores[1]);
    assert.notDeepEqual(ecoScores, techScores);
  });

  it('стандартный/классический набор без темы — 0 (нейтрально)', () => {
    assert.equal(scoreConceptThemeMatch(p('Флешка промо', 'Электроника'), 'Стандартный набор'), 0);
  });
});

describe('Фикс 3: audience-needs скоринг', () => {
  it('deriveAudienceNeeds: продажник→presentation/mobility, врач→relax/recognition', () => {
    const sales = deriveAudienceNeeds('наборы для онбординга менеджеров по продажам');
    assert.ok(sales.includes('presentation') && sales.includes('mobility'));
    const doc = deriveAudienceNeeds('подарки врачам на день медицинского работника');
    assert.ok(doc.includes('relax') && doc.includes('recognition'));
  });

  it('визитница продажнику скорит ВЫШЕ generic ручки', () => {
    const needs = deriveAudienceNeeds('менеджеры по продажам');
    assert.ok(
      scoreAudienceNeedsMatch(p('Визитница кожаная', 'Аксессуары'), needs) >
        scoreAudienceNeedsMatch(p('Ручка шариковая', 'Ручки'), needs),
    );
  });

  it('плед бустится врачу (relax), но НЕ продажнику (mobility≠relax)', () => {
    assert.ok(scoreAudienceNeedsMatch(p('Плед флисовый', 'Текстиль'), deriveAudienceNeeds('подарки врачам')) > 0);
    assert.equal(scoreAudienceNeedsMatch(p('Плед флисовый', 'Текстиль'), deriveAudienceNeeds('менеджеры по продажам')), 0);
  });

  it('обобщаемость: новая профессия (разработчик) активирует свои needs', () => {
    const dev = deriveAudienceNeeds('подарки разработчикам и программистам');
    assert.ok(dev.includes('tech') && dev.includes('desk'));
  });
});

describe('Архетипы подарка по аудитории', () => {
  beforeEach(() => clearProductTypeCache());

  it('врачу: сувенирная флешка/антистресс — сильный анти-штраф (по типу)', () => {
    const arch = pickArchetypeForConcept('подарки врачам на день медицинского работника', 'Классический набор');
    assert.ok(arch, 'архетип врача найден');
    assert.equal(scoreArchetypeMatch(p('Флешка в виде футболки, 16 Гб', 'Электроника'), arch), ARCHETYPE_ANTI);
    assert.equal(scoreArchetypeMatch(p('Антистресс "Авокадо"', 'Отдых и спорт'), arch), ARCHETYPE_ANTI);
  });

  it('врачу: целевые (термос/плед/кружка/ежедневник) — позитив', () => {
    const b = 'подарки врачам';
    // хотя бы один вариант архетипа врача бустит термос и плед
    const variants = resolveAudienceArchetypes(b);
    assert.ok(variants.some((v) => scoreArchetypeMatch(p('Термос стальной 500 мл', 'Термосы'), v) === ARCHETYPE_POSITIVE));
    assert.ok(variants.some((v) => scoreArchetypeMatch(p('Плед флисовый', 'Текстиль'), v) === ARCHETYPE_POSITIVE));
  });

  it('продажнику: визитница/органайзер — позитив, антистресс/носки — анти', () => {
    const variants = resolveAudienceArchetypes('онбординг менеджеров по продажам');
    assert.ok(variants.length > 0);
    assert.ok(variants.some((v) => scoreArchetypeMatch(p('Визитница кожаная', 'Аксессуары'), v) === ARCHETYPE_POSITIVE));
    assert.ok(variants.every((v) => scoreArchetypeMatch(p('Антистресс "Авокадо"', 'Отдых и спорт'), v) === ARCHETYPE_ANTI));
  });

  it('разные концепции получают РАЗНЫЕ архетипы (когерентность+разнообразие)', () => {
    const b = 'подарки врачам на день медицинского работника';
    const ids = ['Классический набор', 'Уютный набор', 'Премиум набор', 'Тех-набор', 'Эко-набор']
      .map((t) => pickArchetypeForConcept(b, t)?.id);
    assert.ok(new Set(ids).size >= 2, `архетипы не разнообразятся: ${ids.join(',')}`);
  });

  it('не-таргет-бриф без аудитории — архетипа нет (нейтрально)', () => {
    assert.equal(pickArchetypeForConcept('новогоднее празднование', 'Набор'), null);
    assert.equal(scoreArchetypeMatch(p('Флешка', 'Электроника'), null), 0);
  });

  it('анти-штраф строго слабее variety-cap −150 (не воскрешает семейства обратным знаком)', () => {
    assert.ok(Math.abs(ARCHETYPE_ANTI) < 150 && ARCHETYPE_POSITIVE < 150);
  });
});

describe('scoreGiftWorthiness: анти-сувенир по имени (все брифы)', () => {
  it('сувенирные формы штрафуются', () => {
    for (const n of [
      'Флешка в виде футболки, 16 Гб',
      'Флешка в виде ручки с мини чипом',
      'Классическая обложка для паспорта "Favor"',
      'Эластичный браслет с полноцветной печатью',
      'Набор из 12 карандашей',
      'Антистресс "Авокадо", зеленый',
    ]) {
      assert.equal(scoreGiftWorthiness(p(n, 'Прочее')), GIFT_JUNK_PENALTY, n);
    }
  });
  it('нормальные подарочные позиции — 0 (не штрафуются)', () => {
    for (const n of ['Термос стальной 500 мл', 'Ежедневник кожаный А5', 'Плед флисовый', 'Флешка Suomi 16 Гб металлическая']) {
      assert.equal(scoreGiftWorthiness(p(n, 'Прочее')), 0, n);
    }
  });
});

describe('деконфликтация: суммарный бонус ограничен', () => {
  it('theme+audience ≤ CONTEXT_BONUS_CAP и строго < variety −150', () => {
    // товар, попадающий и в тему, и в несколько needs
    const combo = scoreContextBonus(
      p('Кожаный органайзер для документов с гравировкой', 'Аксессуары'),
      'Премиум набор', 'бизнес-подарок', deriveAudienceNeeds('руководителям и директорам'),
    );
    assert.ok(combo <= CONTEXT_BONUS_CAP, `bonus ${combo} > cap ${CONTEXT_BONUS_CAP}`);
    assert.ok(combo < 150);
  });
});
