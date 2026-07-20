import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import {
  clearProductTypeCache,
  detectTypeSlug,
  familyForType,
  typeConflictsInSet,
  allClassifierSlugs,
  TYPE_META,
} from './product-taxonomy';
import { detectProductRole, roleFamilyForProduct } from './product-role.util';
import { detectConceptProductType } from '../providers/llm/concept-diversity.util';

function mk(name: string, description = ''): CatalogProduct {
  return {
    id: name,
    name,
    description,
    category: 'Подарки',
    subcategory: null,
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/p.jpg',
    price: 500,
    colors: [],
  };
}

describe('единая таксономия товаров', () => {
  beforeEach(() => clearProductTypeCache());

  it('detectConceptProductType и detectProductRole.legacyType всегда совпадают', () => {
    const names = [
      'Кружка керамика',
      'Бутылка спорт',
      'Термокружка Steel',
      'Блокнот А5',
      'Ручка металлическая',
      'Рюкзак городской',
      'Плед флисовый',
      'Powerbank 10000',
      'Подарочный набор с пледом и термокружкой',
      'Зонт-трость',
      'Шоппер хлопковый',
      'Кепка бейсболка',
    ];
    for (const name of names) {
      const product = mk(name);
      assert.equal(
        detectConceptProductType(product),
        detectProductRole(product).legacyType,
        `рассинхрон типов для "${name}"`,
      );
    }
  });

  it('семейство по товару = семейству по slug (единый источник)', () => {
    for (const name of ['Кружка', 'Бутылка', 'Рюкзак', 'Шоппер', 'Блокнот']) {
      const product = mk(name);
      assert.equal(roleFamilyForProduct(product), familyForType(detectTypeSlug(product)));
    }
  });

  it('кружка / бутылка / термос — одно семейство drinkware (конфликтуют)', () => {
    assert.equal(familyForType('mug'), 'drinkware');
    assert.equal(familyForType('bottle'), 'drinkware');
    assert.equal(familyForType('thermos'), 'drinkware');
    assert.ok(typeConflictsInSet(new Set(['mug']), 'bottle'));
  });

  it('футболка и худи НЕ конфликтуют (оба можно в мерч-набор)', () => {
    assert.ok(!typeConflictsInSet(new Set(['tshirt']), 'hoodie'));
  });

  it('кепка и очки НЕ конфликтуют (разные семейства)', () => {
    assert.ok(!typeConflictsInSet(new Set(['cap']), 'sunglasses'));
  });

  it('многосоставный подарочный набор классифицируется как gift_set, а не по вложению', () => {
    assert.equal(detectTypeSlug(mk('Подарочный набор с пледом, термокружкой и чаем')), 'gift_set');
    assert.equal(detectTypeSlug(mk('Набор «Зимний» с пледом')), 'gift_set');
  });

  it('одиночный плед — это blanket, а не gift_set', () => {
    assert.equal(detectTypeSlug(mk('Плед флисовый Арго')), 'blanket');
    assert.equal(detectTypeSlug(mk('Плед-подушка Вояж')), 'blanket');
  });
});

describe('распознавание «повербанк» (транслитерация через О)', () => {
  beforeEach(() => clearProductTypeCache());

  it('«повербанк» и «повер банк» → powerbank', () => {
    assert.equal(detectTypeSlug(mk('Внешний повербанк 10000 мАч')), 'powerbank');
    assert.equal(detectTypeSlug(mk('Повер банк с фонариком софт-тач')), 'powerbank');
    assert.equal(detectConceptProductType(mk('Повербанк Slim 10000')), 'powerbank');
  });

  it('«аккумулятор внешний» → powerbank', () => {
    assert.equal(detectTypeSlug(mk('Аккумулятор внешний 10000')), 'powerbank');
  });
});

describe('G2: корневые фиксы таксономии (пере-скан 2026-07-10)', () => {
  beforeEach(() => clearProductTypeCache());

  it('«5000 мАч» распознаётся как powerbank (была мёртвая \\bмач\\b — кириллица не в \\w)', () => {
    assert.equal(detectTypeSlug(mk('Внешний блок питания 5000 мАч')), 'powerbank');
    assert.equal(detectConceptProductType(mk('Гаджет 8000 мАч soft-touch')), 'powerbank');
  });

  it('«бамбуковый» БЕЗ сосуда НЕ классифицируется как кружка (была голая /бамбуков/)', () => {
    assert.notEqual(detectTypeSlug(mk('Бамбуковая разделочная доска')), 'mug');
    assert.notEqual(detectTypeSlug(mk('Бамбуковый органайзер для стола')), 'mug');
    // но настоящая бамбуковая кружка — по-прежнему кружка
    assert.equal(detectTypeSlug(mk('Бамбуковая кружка эко')), 'mug');
  });

  it('build-time консистентность: КАЖДЫЙ слаг, который классификатор может вернуть, имеет СВОЮ запись в TYPE_META', () => {
    // Регресс board_game: SLUG_RULES эмитил слаг без записи в TYPE_META → тихо схлопывался в
    // DEFAULT_META (=other). Этот тест ловит будущие такие же провалы автоматически.
    const missing = allClassifierSlugs().filter(
      (slug) => !Object.prototype.hasOwnProperty.call(TYPE_META, slug),
    );
    assert.deepEqual(missing, [], `слаги без записи в TYPE_META (коллапсируют в DEFAULT_META): ${missing.join(', ')}`);
  });

  it('board_game имеет собственное семейство (не коллапсирует в other/DEFAULT_META)', () => {
    const slug = detectTypeSlug(mk('Настольная игра Домино'));
    assert.equal(slug, 'board_game');
    assert.equal(familyForType('board_game'), 'unique:board_game');
    assert.notEqual(familyForType('board_game'), familyForType('other'));
  });

  it('category-only фолбэк «для дома»/«текстиль» больше НЕ навязывает конкретный неверный слаг', () => {
    // Ни имя, ни подкатегория не дают совпадения — категория слишком широкая для точного типа.
    const home = mk('Универсальный аксессуар Комфорт');
    home.category = 'Товары для дома';
    assert.equal(detectTypeSlug(home), 'other');

    const textile = mk('Изделие Прованс');
    textile.category = 'Текстиль';
    assert.equal(detectTypeSlug(textile), 'other');

    // но настоящее полотенце/свеча по ИМЕНИ по-прежнему определяются верно
    assert.equal(detectTypeSlug(mk('Полотенце махровое')), 'towel');
    assert.equal(detectTypeSlug(mk('Свеча ароматическая')), 'candle');
  });

  it('breadcrumb-подкатегория (эхо имени категории) НЕ навязывает candle/towel без корроборации именем', () => {
    // РЕАЛЬНЫЙ регресс, найденный эмпирически на 51k-каталоге: subcategory хранит ПОЛНЫЙ
    // breadcrumb-путь «Для дома / Инструменты и мультитулы / Рулетки», включающий имя корневой
    // категории. Рулетка/мультиинструмент раньше классифицировались как candle только из-за
    // подстроки «для дома» в breadcrumb — sub/text-проверка ловила ту же переобобщённость, что и
    // чисто категорийный фолбэк, но была ДО него и не была защищена.
    const tapeMeasure = mk('Рулетка 3м Meter софт-тач красный');
    tapeMeasure.category = 'Для дома';
    tapeMeasure.subcategory = 'Для дома / Инструменты и мультитулы / Рулетки';
    assert.notEqual(detectTypeSlug(tapeMeasure), 'candle', 'рулетка не должна стать свечой из-за breadcrumb "для дома"');

    // настоящая свеча с такой же категорией/breadcrumb — по-прежнему candle (корроборация именем)
    const candle = mk('Свеча ароматическая ваниль');
    candle.category = 'Для дома';
    candle.subcategory = 'Для дома / Декор / Свечи';
    assert.equal(detectTypeSlug(candle), 'candle');

    // текстиль: безымянное изделие с breadcrumb-подкатегорией «Текстиль» не должно стать полотенцем
    const genericTextile = mk('Изделие Прованс декоративное');
    genericTextile.category = 'Текстиль';
    genericTextile.subcategory = 'Текстиль / Декор / Разное';
    assert.notEqual(detectTypeSlug(genericTextile), 'towel');
  });

  it('mandatoryTypeAliases(flash_drive) включает продуктовый slug flash (мост между брифом и товаром)', async () => {
    const { mandatoryTypeAliases, hasMandatoryTypeInProducts } = await import(
      '../providers/llm/concept-diversity.util'
    );
    const aliases = mandatoryTypeAliases('flash_drive');
    assert.ok(aliases.includes('flash'), `flash_drive должен алиасить flash: ${aliases}`);
    // Реальная флешка классифицируется как 'flash' (никогда как 'flash_drive') — без моста
    // hasMandatoryTypeInProducts('flash_drive') был бы вечно false.
    assert.ok(hasMandatoryTypeInProducts([mk('Флешка USB 32 ГБ')], 'flash_drive'));
  });

  it('«apparel»/«tech» больше НЕ капаются общим displayType=1 (fine-семейство решает отдельно)', async () => {
    const { displayTypeForCap, isDisplayCappedType, wouldExceedDisplayTypeCap } = await import(
      './selection-constraints'
    );
    // Метка displayType может совпадать («apparel»/«tech» — это ярлык роли), но она больше НЕ в
    // капе=1 — фактический предел «1 на набор» теперь только у fine-семейства (unique:tshirt и
    // т.п.), которое позволяет РАЗНЫМ типам сосуществовать.
    assert.ok(!isDisplayCappedType(displayTypeForCap(mk('Футболка хлопковая'))));
    assert.ok(!isDisplayCappedType(displayTypeForCap(mk('Наушники беспроводные'))));

    const tshirt = mk('Футболка хлопковая');
    const hoodie = mk('Худи оверсайз');
    assert.ok(
      !wouldExceedDisplayTypeCap(hoodie, [tshirt]),
      'худи не должно блокироваться капом displayType из-за уже выбранной футболки',
    );

    const headphones = mk('Наушники беспроводные');
    const speaker = mk('Колонка портативная Bluetooth');
    assert.ok(
      !wouldExceedDisplayTypeCap(speaker, [headphones]),
      'колонка не должна блокироваться капом displayType из-за уже выбранных наушников',
    );
  });
});
