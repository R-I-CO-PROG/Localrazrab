import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBriefRelevanceContext,
  scoreBriefRelevanceWithContext,
} from './catalog-brief-relevance.util';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: category, description: '', price: 1500,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

// on-тема ранжируется выше off-темы, когда бриф явно назвал тему.
function assertThemeOrders(brief: string, onName: string, offName: string, minGap = 20) {
  const ctx = buildBriefRelevanceContext(brief, []);
  const on = scoreBriefRelevanceWithContext(p(onName), ctx);
  const off = scoreBriefRelevanceWithContext(p(offName), ctx);
  assert.ok(on > off + minGap, `[${brief}] on(${onName})=${on} off(${offName})=${off}`);
}

describe('Обобщённые темы (THEME_INTENTS) — по запрошенной теме (задача про «разные темы»)', () => {
  it('минималистичный → лаконичное выше пёстрого', () => {
    assertThemeOrders('минималистичный сдержанный набор', 'Лаконичный монохромный блокнот', 'Яркий брелок с пайетками');
  });
  it('яркий/молодёжный → неон-стикеры выше строгой канцелярии', () => {
    assertThemeOrders('яркий молодёжный мерч', 'Стикерпак неоновый яркий', 'Строгий деловой канцелярский набор');
  });
  it('элегантный → кожа/гравировка выше пластик-промо', () => {
    assertThemeOrders('элегантный изысканный набор', 'Кожаный футляр с гравировкой', 'Пластиковый брелок промо');
  });
  it('натуральные материалы → дерево/бамбук выше пластика', () => {
    assertThemeOrders('набор из натуральных материалов ручной работы', 'Бамбуковый органайзер', 'Пластиковый LED-гаджет');
  });
  it('без темы в брифе — theme_intent не активен (не мешает)', () => {
    const ctx = buildBriefRelevanceContext('подарки сотрудникам компании', []);
    assert.equal(ctx.activeThemeIntents.length, 0);
  });

  it('расширенный набор тем (30+): каждая триггерится и ранжирует в тему выше не-в-тему', () => {
    const cases: Array<[string, string, string]> = [
      ['набор для путешествий', 'Дорожный несессер адаптер', 'Настольная стеклянная фигурка'],
      ['кофейный набор для бариста', 'Термокружка турка кофе', 'Спортивная бутылка шейкер'],
      ['чайный набор для чаепития', 'Заварочный чайник термокружка', 'Спортивная бутылка шейкер'],
      ['игровой гейминг набор', 'Коврик для мыши RGB подсветка', 'Классический кожаный ежедневник делов'],
      ['музыкальный набор для меломана', 'Колонка наушники TWS', 'Деловой ежедневник'],
      ['деловой строгий представительский набор', 'Ежедневник визитница кожаная папка', 'Игрушка антистресс мультяшный'],
      ['брутальный мужской набор для него', 'Кожаный стальной мультитул', 'Розовый нежный пастель пайетки'],
      ['женственный нежный подарок для неё', 'Ароматическая свеча шёлковый шарф', 'Мультитул нож фляжка'],
      ['кожаный набор', 'Кожаное портмоне', 'Пластиковый силиконовый'],
      ['роскошный золотой люкс', 'Золотой кожаный футляр гравировка', 'Пластиковый промо брелок'],
      ['футуристичный космический набор', 'LED RGB беспроводная зарядка smart', 'Деревянный крафт винтаж'],
      ['осенний набор', 'Тёплый плед термокружка чай', 'Пляжная летняя панама купальник'],
      ['набор для ухода бьюти', 'Косметический крем зеркало', 'Инструмент нож отвёртка'],
    ];
    for (const [brief, on, off] of cases) {
      const ctx = buildBriefRelevanceContext(brief, []);
      assert.ok(ctx.activeThemeIntents.length > 0, `тема не сработала: "${brief}"`);
      const son = scoreBriefRelevanceWithContext(p(on), ctx);
      const soff = scoreBriefRelevanceWithContext(p(off), ctx);
      assert.ok(son > soff + 10, `[${brief}] on=${son} off=${soff} intents=[${ctx.activeThemeIntents.map((t) => t.id).join(',')}]`);
    }
  });
});
