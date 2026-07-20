import type { IdeatorIdea, IdeatorOutput } from './contracts';

const THEMES = [
  {
    title: 'Небесный welcome-pack',
    build: (q: string) =>
      `Концепция «${q.slice(0, 60)}»: welcome-набор в авиационной эстетике — мягкий текстиль с силуэтом крыла, термокружка «cloud white», блокнот для заметок экипажа. Логотип — вышивка на текстиле и тампопечать на кружке. Подходит для онбординга и VIP-гостей.`,
  },
  {
    title: 'Премиум flight kit',
    build: (q: string) =>
      `Премиальный набор для деловых поездок: кожаный блокнот A5, металлическая ручка, компактный powerbank в футляре. Визуальный код — чистые линии фюзеляжа, фирменные цвета на акцентах. Логотип гравируется на ручке и тиснением на обложке.`,
  },
  {
    title: 'Sky lounge gift',
    build: (q: string) =>
      `Подарок «sky lounge»: керамическая кружка, носки premium cotton, стикер-пак с авиа-мотивами. Атмосфера уютной бизнес-зоны аэропорта. Брендинг заметен, но не агрессивен — логотип на кружке и упаковке.`,
  },
  {
    title: 'Эко-полёт',
    build: (q: string) =>
      `Эко-концепция под запрос «${q.slice(0, 50)}»: бамбуковая ручка, блокнот из переработанной бумаги, термос без одноразового пластика. Акцент на устойчивости и современном транспорте будущего. Логотип — на термосе и обложке блокнота.`,
  },
  {
    title: 'Команда в небе',
    build: (q: string) =>
      `Team-building набор: одинаковые футболки экипажа, бейджи, брендированный рюкзак для служебных поездок. Объединяет команду вокруг идеи полёта и общего бренда. Логотип — крупно на груди и мелко на бейджах.`,
  },
  {
    title: 'Конференция авиа',
    build: (q: string) =>
      `Конференц-сувенир: лanyard, блокнот, ручка, брендированный шоппер. Быстрая раздача на стенде, узнаваемый силуэт самолёта в паттерне. Логотип на всех носителях для максимального охвата.`,
  },
  {
    title: 'Детский авиа-merch',
    build: (q: string) =>
      `Яркий детский набор: мягкая игрушка-самолётик, раскраска, карандаши. Безопасные материалы, весёлые иллюстрации неба. Логотип компании — на упаковке и игрушке.`,
  },
  {
    title: 'Executive jet set',
    build: (q: string) =>
      `Executive-подарок: кожаный органайзер, премиальная термокружка, запонки/аксессуар с avia-деталью. Минимализм, дорогие материалы. Логотип — дискретное тиснение.`,
  },
  {
    title: 'Urban pilot',
    build: (q: string) =>
      `Urban-стиль: кепка, худи, термокружка to-go. Молодёжная аудитория, streetwear + avia. Логотип — вышивка на кепке и принт на худи.`,
  },
  {
    title: 'Cargo & logistics',
    build: (q: string) =>
      `Практичный набор для логистики: прочная сумка, блокнот waterproof, флешка брендированная. Ассоциация с надёжной доставкой и скоростью. Логотип на сумке и флешке.`,
  },
  {
    title: 'Ночной рейс',
    build: (q: string) =>
      `Тёмная палитра «night flight»: чёрная кружка, тёмный блокнот, ручка с подсветкой. Премиальный nocturne mood. Логотип — серебряная печать.`,
  },
  {
    title: 'Солнечный взлёт',
    build: (q: string) =>
      `Светлый optimistic kit: белая кружка, жёлтые акценты, блокнот «sunrise». Энергия нового проекта и взлёта. Логотип — полноцвет на кружке.`,
  },
];

/** Русские текстовые концепции когда OpenRouter недоступен */
export function buildLocalIdeatorFallback(input: {
  userQuery: string;
  category?: string;
  colors?: string[];
}): IdeatorOutput {
  const q = input.userQuery.trim() || 'корпоративный мерч';
  const ideas: IdeatorIdea[] = [];

  for (let i = 0; i < 22; i++) {
    const theme = THEMES[i % THEMES.length];
    const suffix = i >= THEMES.length ? ` · вариант ${Math.floor(i / THEMES.length) + 1}` : '';
    ideas.push({
      title: `${theme.title}${suffix}`,
      description: theme.build(q),
      items: [
        { productType: i % 2 === 0 ? 'mug' : 'notebook', priority: 'must' },
        { productType: i % 3 === 0 ? 'tshirt' : 'pen', priority: 'nice' },
      ],
      styleTags: ['premium', 'aviation'].slice(0, 1 + (i % 2)),
      colorPalette: input.colors?.length ? input.colors.slice(0, 3) : ['#1A1A1A', '#FFFFFF'],
      whyItFits: `Отражает запрос клиента и категорию «${input.category ?? 'Welcome Pack'}».`,
    });
  }

  return { ideas };
}

export function isStubLikeDescription(desc: string): boolean {
  return (
    /curated .+ set for brand visibility/i.test(desc) ||
    /^Auto idea \d+ for /i.test(desc) ||
    (desc.length < 40 && !/[а-яё]/i.test(desc))
  );
}
