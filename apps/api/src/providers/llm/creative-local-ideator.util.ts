import type { IdeatorIdea, IdeatorItem } from '../../agents/contracts';

const CREATIVE_ARCHETYPES: Array<{
  title: string;
  hook: string;
  description: string;
  items: IdeatorItem[];
  styleTags: string[];
}> = [
  {
    title: 'Welcome-набор новичка',
    hook: 'Кастомная термокружка с гравировкой',
    description: 'Практичный стартовый комплект для онбординга: термос, блокнот и ручка в единой палитре бренда.',
    items: [
      { productType: 'thermos', notes: 'матовый термос с лазерной гравировкой логотипа', priority: 'must' },
      { productType: 'notebook', notes: 'блокнот A5 с тиснением', priority: 'must' },
      { productType: 'pen', notes: 'металлическая ручка с клипом под цвет бренда', priority: 'nice' },
    ],
    styleTags: ['практичный', 'офисный'],
  },
  {
    title: 'Tech-комплект для команды',
    hook: 'Повербанк в форме фирменного символа',
    description: 'Гаджетный набор для IT и digital-команд: зарядка, флешка и бутылка в tech-эстетике.',
    items: [
      { productType: 'powerbank', notes: 'компактный powerbank 10000 mAh с UV-печатью', priority: 'must' },
      { productType: 'flashdrive', notes: 'USB-C флешка в брендированном корпусе', priority: 'must' },
      { productType: 'bottle', notes: 'тритановая бутылка с градиентом бренда', priority: 'nice' },
    ],
    styleTags: ['tech', 'современный'],
  },
  {
    title: 'Эко daily kit',
    hook: 'Шоппер из переработанного хлопка',
    description: 'Устойчивый набор на каждый день: шоппер, кружка и блокнот из eco-материалов.',
    items: [
      { productType: 'bag', notes: 'шоппер из recycled cotton с шелкографией', priority: 'must' },
      { productType: 'mug', notes: 'керамическая кружка с матовым покрытием', priority: 'must' },
      { productType: 'notebook', notes: 'блокнот на переработанной бумаге', priority: 'nice' },
    ],
    styleTags: ['эко', 'минимализм'],
  },
  {
    title: 'Премиальный подарочный сет',
    hook: 'Подарочная коробка с магнитной крышкой',
    description: 'Премиальная упаковка с термокружкой, ручкой и открыткой для VIP-клиентов.',
    items: [
      { productType: 'giftbox', notes: 'жёсткая коробка с магнитным замком и логотипом', priority: 'must' },
      { productType: 'thermos', notes: 'термокружка 350 мл с soft-touch покрытием', priority: 'must' },
      { productType: 'pen', notes: 'премиальная ручка в футляре', priority: 'nice' },
    ],
    styleTags: ['премиум', 'подарок'],
  },
  {
    title: 'Event-набор участника',
    hook: 'Бейдж с NFC-чипом',
    description: 'Набор для конференций и мероприятий: бейдж, бутылка и блокнот для заметок.',
    items: [
      { productType: 'card', notes: 'бейдж с NFC и лентой в цветах бренда', priority: 'must' },
      { productType: 'bottle', notes: 'лёгкая бутылка 500 мл', priority: 'must' },
      { productType: 'notebook', notes: 'планшет для заметок формата A6', priority: 'nice' },
    ],
    styleTags: ['event', 'динамичный'],
  },
  {
    title: 'Комфорт и уют',
    hook: 'Плед с вышитым логотипом',
    description: 'Уютный набор для remote-команд: плед, кружка и свеча в тёплой палитре.',
    items: [
      { productType: 'accessory', notes: 'флисовый плед с вышивкой логотипа', priority: 'must' },
      { productType: 'mug', notes: 'объёмная кружка 400 мл', priority: 'must' },
      { productType: 'accessory', notes: 'ароматическая свеча в брендированном стакане', priority: 'nice' },
    ],
    styleTags: ['уют', 'wellness'],
  },
  {
    title: 'Спорт-актив набор',
    hook: 'Бутылка с тайм-маркерами',
    description: 'Набор для активного образа жизни: бутылка, полотенце и браслет.',
    items: [
      { productType: 'bottle', notes: 'спортивная бутылка с шкалой времени', priority: 'must' },
      { productType: 'accessory', notes: 'микрофибровое полотенце с логотипом', priority: 'must' },
      { productType: 'accessory', notes: 'силиконовый браслет с QR', priority: 'nice' },
    ],
    styleTags: ['спорт', 'энергия'],
  },
  {
    title: 'Офисный must-have',
    hook: 'Органайзер с лазерной резкой',
    description: 'Классический офисный набор: органайзер, ручка и блокнот для ежедневной работы.',
    items: [
      { productType: 'accessory', notes: 'настольный органайзер из дерева с гравировкой', priority: 'must' },
      { productType: 'pen', notes: 'шариковая ручка soft-grip', priority: 'must' },
      { productType: 'notebook', notes: 'ежедневник с эластичным ремешком', priority: 'nice' },
    ],
    styleTags: ['офис', 'классика'],
  },
  {
    title: 'Путешествие и дорога',
    hook: 'Дорожный органайзер с RFID',
    description: 'Набор для команд в разъездах: органайзер, термос и зарядка.',
    items: [
      { productType: 'accessory', notes: 'дорожный органайзер с RFID-защитой', priority: 'must' },
      { productType: 'thermos', notes: 'компактный термос 300 мл', priority: 'must' },
      { productType: 'powerbank', notes: 'тонкий powerbank 5000 mAh', priority: 'nice' },
    ],
    styleTags: ['travel', 'мобильность'],
  },
  {
    title: 'Креативный twist-набор',
    hook: 'Повербанк необычной формы',
    description: 'Запоминающийся набор с нестандартными формами, но реально производимыми позициями.',
    items: [
      { productType: 'powerbank', notes: 'powerbank в форме фирменного маскота', priority: 'must' },
      { productType: 'sticker', notes: 'набор стикеров с иллюстрациями бренда', priority: 'must' },
      { productType: 'keychain', notes: 'брелок из soft-touch пластика', priority: 'nice' },
    ],
    styleTags: ['креатив', 'запоминающийся'],
  },
];

function briefSnippet(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57)}…`;
}

/** Детерминированные креативные идеи без LLM — гарантия непустого ideatorOutput */
export function generateLocalCreativeIdeas(input: {
  userPrompt: string;
  colors?: string[];
  count?: number;
}): IdeatorIdea[] {
  const target = Math.max(6, Math.min(input.count ?? 10, CREATIVE_ARCHETYPES.length));
  const snippet = briefSnippet(input.userPrompt);
  const palette = (input.colors ?? []).slice(0, 5);

  return CREATIVE_ARCHETYPES.slice(0, target).map((arch, i) => ({
    title: `${arch.title} ${i > 0 ? i + 1 : ''}`.trim(),
    hook: arch.hook,
    description: `${arch.description} Контекст брифа: ${snippet}.`,
    items: arch.items,
    styleTags: arch.styleTags,
    colorPalette: palette.length ? palette : ['#1a1a2e', '#e94560'],
    whyItFits: `Локальный шаблон под бриф: ${snippet}`,
  }));
}
