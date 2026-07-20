import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productDna, audienceDna, scoreComposition, optimizeComposition } from './catalog-gift-dna.util';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: name, price: 700,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('Gift DNA: оси товара', () => {
  it('плед → cozy/relax/care; повербанк → energy/tech', () => {
    const pled = productDna(p('Плед флисовый Арго'));
    assert.ok(pled.has('cozy') && pled.has('relax'));
    const pb = productDna(p('Внешний аккумулятор 5000 mAh', 'Электроника'));
    assert.ok(pb.has('energy') && pb.has('tech'));
  });
  it('ежедневник → work; эко-сумка → eco/travel', () => {
    assert.ok(productDna(p('Ежедневник недатированный А5', 'Ежедневники')).has('work'));
    const eco = productDna(p('Сумка из переработанного хлопка', 'Сумки'));
    assert.ok(eco.has('eco') && eco.has('travel'));
  });
});

describe('audienceDna', () => {
  it('врач → care/relax; продажник → work/travel', () => {
    assert.ok(audienceDna('подарки врачам').has('care'));
    assert.ok(audienceDna('онбординг менеджеров по продажам').has('work'));
  });
});

describe('scoreComposition: набор оценивается как композиция', () => {
  it('цельная история (термос+чай+плед) > свалки (рюкзак+термос+носки+флешка)', () => {
    const aud = audienceDna('тёплые зимние наборы для сотрудников');
    const cohesive = [p('Термос стальной 500 мл', 'Термосы'), p('Чай подарочный в тубусе', 'Чай'), p('Плед флисовый', 'Текстиль')];
    const random = [p('Рюкзак городской', 'Сумки'), p('Термос стальной', 'Термосы'), p('Носки хлопковые', 'Одежда'), p('Флешка 16 Гб', 'Электроника')];
    const cs = scoreComposition(cohesive, aud).total;
    const rs = scoreComposition(random, aud).total;
    assert.ok(cs > rs, `cohesive ${cs} vs random ${rs}`);
  });

  it('доминирующая ось выявляется (cozy для уютного набора)', () => {
    const set = [p('Плед флисовый'), p('Ароматическая свеча'), p('Чай подарочный', 'Чай'), p('Керамическая кружка', 'Кружки')];
    const br = scoreComposition(set, audienceDna('уютный подарок'));
    assert.ok(['cozy', 'relax', 'care'].includes(br.dominantAxis ?? ''), `dominant ${br.dominantAxis}`);
    assert.ok(br.cohesion > 0);
  });

  it('набор в ДНК аудитории скорит выше, чем мимо неё', () => {
    const set = [p('Термокружка стальная', 'Термосы'), p('Ежедневник кожаный', 'Ежедневники'), p('Визитница кожаная', 'Аксессуары')];
    const inAud = scoreComposition(set, audienceDna('онбординг менеджеров по продажам')).audience;
    const offAud = scoreComposition(set, audienceDna('подарки врачам')).audience;
    assert.ok(inAud >= offAud, `sales ${inAud} vs doc ${offAud}`);
  });

  it('синергия: комплементарная пара повышает синергию против чужой', () => {
    const good = scoreComposition([p('Ежедневник А5', 'Ежедневники'), p('Ручка в футляре', 'Ручки')], new Set()).synergy;
    const bad = scoreComposition([p('Скакалка спортивная', 'Спорт'), p('Кожаный футляр премиум', 'Аксессуары')], new Set()).synergy;
    assert.ok(good > bad, `good ${good} vs bad ${bad}`);
  });
});

describe('optimizeComposition: hill-climb повышает композиционный балл', () => {
  it('меняет чужеродную позицию на усиливающую историю', () => {
    const aud = audienceDna('тёплый зимний уютный набор');
    // старт: термос + плед + случайная флешка (флешка выбивается из уютной истории)
    const set = [p('Термос стальной 500 мл', 'Термосы'), p('Плед флисовый', 'Текстиль'), p('Флешка 16 Гб', 'Электроника')];
    // в пуле есть чай — усиливает cozy/relax историю
    const pool = [p('Чай подарочный в тубусе', 'Чай'), p('Ароматическая свеча', 'Свечи'), p('Ручка шариковая', 'Ручки')];
    const before = scoreComposition(set, aud).total;
    const { set: opt, swaps } = optimizeComposition({
      set, pool, audience: aud, budgetPerSet: 5000,
      isMandatory: () => false, canUse: () => true,
      dupesRole: (c, rest) => rest.some((r) => r.category === c.category),
    });
    const after = scoreComposition(opt, aud).total;
    assert.ok(after >= before, `after ${after} < before ${before}`);
    assert.ok(swaps.length >= 1, 'ожидался хотя бы один улучшающий своп');
    assert.ok(opt.some((x) => /чай|свеч/i.test(x.name)), `история не усилена: ${opt.map((x) => x.name)}`);
  });

  it('не трогает mandatory-позицию', () => {
    const set = [p('Проектор портативный', 'Электроника'), p('Флешка 16 Гб', 'Электроника')];
    const pool = [p('Чай подарочный', 'Чай')];
    const { set: opt } = optimizeComposition({
      set, pool, audience: audienceDna('уют'), budgetPerSet: 5000,
      isMandatory: (x) => /проектор/i.test(x.name), canUse: () => true, dupesRole: () => false,
    });
    assert.ok(opt.some((x) => /проектор/i.test(x.name)), 'mandatory проектор выброшен');
  });

  it('G5: фиксирует свопы в реестре ПО ХОДУ — не пускает line-дубль свопнутого кандидата (иной семьи, мимо dupesRole)', () => {
    const aud = audienceDna('онбординг менеджеров по продажам'); // work/travel
    // Товар с явной «линейкой» (эмулируем brand/line-ключ реестра, который canUse обязан уважать).
    const withLine = (name: string, category: string, line: string): CatalogProduct =>
      ({ ...p(name, category), _line: line } as unknown as CatalogProduct);
    const lineOf = (x: CatalogProduct): string | undefined => (x as unknown as { _line?: string })._line;

    // Мок-реестр по контракту SelectionLedger, но по одному line-ключу (детерминизм теста).
    const makeLedger = () => {
      const reserved = new Set<string>();
      return {
        canUse: (x: CatalogProduct) => { const l = lineOf(x); return !(l && reserved.has(l)); },
        reserve: (x: CatalogProduct) => { const l = lineOf(x); if (l) reserved.add(l); },
        release: (x: CatalogProduct) => { const l = lineOf(x); if (l) reserved.delete(l); },
      };
    };

    // Старт: две НЕ-work позиции — обе улучшатся свопом в work-товары.
    const startSet = () => [p('Ароматическая свеча', 'Свечи'), p('Скакалка спортивная', 'Спорт')];
    // Пул: два work-товара РАЗНЫХ категорий (мимо dupesRole по категории), но ОДНОЙ линейки 'brandx'
    // — реестр обязан пустить в набор только ОДИН.
    const pool = () => [
      withLine('Ежедневник BrandX кожаный', 'Ежедневники', 'brandx'),
      withLine('Визитница BrandX кожаная', 'Аксессуары', 'brandx'),
    ];
    const dupesRole = (c: CatalogProduct, rest: CatalogProduct[]) => rest.some((r) => r.category === c.category);

    // БЕЗ фиксации по ходу (старое поведение): реестр стал бы стал → оба brandx проскакивают.
    const stale = makeLedger();
    const { set: staleOpt } = optimizeComposition({
      set: startSet(), pool: pool(), audience: aud, budgetPerSet: 5000,
      isMandatory: () => false, canUse: stale.canUse, dupesRole,
    });
    const staleBrandX = staleOpt.filter((x) => lineOf(x) === 'brandx').length;

    // С фиксацией по ходу (фикс): второй brandx блокируется canUse актуального реестра.
    const live = makeLedger();
    const { set: liveOpt } = optimizeComposition({
      set: startSet(), pool: pool(), audience: aud, budgetPerSet: 5000,
      isMandatory: () => false, canUse: live.canUse, dupesRole,
      reserve: live.reserve, release: live.release,
    });
    const liveBrandX = liveOpt.filter((x) => lineOf(x) === 'brandx').length;

    assert.ok(staleBrandX >= 2, `санити: без фикса дубль линейки проскакивает (=${staleBrandX})`);
    assert.equal(liveBrandX, 1, `с фиксом реестр пускает только один товар линейки brandx: ${liveOpt.map((x) => x.name)}`);
  });
});
