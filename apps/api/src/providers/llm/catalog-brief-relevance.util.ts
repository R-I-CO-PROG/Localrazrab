import type { CatalogProduct } from './catalog.util';
import { detectConceptProductType } from './concept-diversity.util';
import { productHasForbiddenColor } from './catalog-color-match.util';
import { extractBriefForbiddenColorHints } from '../../requests/brief-color-palette.util';
import { isCorporateSetFiller } from '../../concept/product-role.util';

function isGiftBundleProductName(text: string): boolean {
  return /набор\s+(?:для|«|")|подарочн\w*\s+набор|gift\s*set/i.test(text);
}

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

function colorLabel(color: unknown): string {
  if (typeof color === 'string') return color;
  if (color && typeof color === 'object') {
    const c = color as { name?: unknown; hex?: unknown };
    if (typeof c.name === 'string') return c.name;
    if (typeof c.hex === 'string') return c.hex;
  }
  return '';
}

function productText(product: CatalogProduct): string {
  return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);
}

function colorNames(product: CatalogProduct): string[] {
  return (product.colors ?? []).map(colorLabel).map(normalizeText).filter(Boolean);
}

/** Запрещённые цвета из текста брифа */
export function parseBriefForbiddenColors(brief: string): string[] {
  return extractBriefForbiddenColorHints(brief);
}

function productViolatesColorBan(product: CatalogProduct, forbiddenColorHints: string[]): boolean {
  return productHasForbiddenColor(product, forbiddenColorHints);
}

const SUMMER_BRIEF = /летн|фестивал|outdoor|open\s*air|пляж|жарк/i;
const WINTER_BRIEF = /зимн|новогод|ёлоч|елоч|рождеств/i;
const COZY_WINTER_BRIEF = /уют|комфорт|тепл|hygge|зимн|благодарност|арендатор|холодн/i;
const TECH_BRIEF = /разработчик|инженер|(?<![а-яёa-z])it(?![а-яёa-z])|айти|tech|конференц|минимализм|инновац|software|devops|программист|хакатон|hackathon|кодер|coder|геймдев|game\s*dev/i;
const SPORT_BRIEF = /спорт|болельщик|динамичн|фитнес|марафон/i;
const HEALTH_BRIEF = /здоров|wellness|медицин|фарма|витамин|зож|well-being/i;
const YOUTH_CREATIVE_BRIEF = /молодеж|молодёж|студент|gen\s*z|зумер|креативн|creative|ярк|неон|фестивал/i;
const ECO_BRIEF = /эко|eco|эколог|земл|устойчив|переработ|sustainable|biodegradable|volonter|активист/i;

const PICNIC_BRIEF = /пикник|picnic|outdoor.*обед/i;
const OUTDOOR_BRIEF = /природ|актив\w*\s*отдых|фестивал|outdoor/i;
const CREATIVE_BRIEF = /креатив|рисован|идей|искусств|вдохновл/i;
const VIP_LUXURY_BRIEF = /эксклюзив|лояльн|премиум|коллекци|vip|luxury|роскошн/i;
const OFFICE_BRIEF = /офис|office|корпоративн\w*\s+подарк|благодарност.*арендатор/i;
// B2B-продажи / онбординг (узко — НЕ ловит любое «менеджер»)
const SALES_BRIEF = /онбординг|onboarding|менеджер\w*\s+по\s+продаж|(?<![а-яё])sales(?![а-яё])|нов(?:ый|ому|ого|ым)\s+сотрудник|welcome[\s-]?pack|новичк/i;
// Премиум/статус/юбилей/топ-менеджмент
const PREMIUM_BRIEF = /vip|инвестор|premium|премиум|премиальн|luxury|роскошн|статусн|юбилей|топ[\s-]?менедж|руководител|директор|c-level/i;
// Подарок женщинам / 8 марта
const WOMENS_DAY_BRIEF = /8\s*март|восьм\w*\s+март|международн\w*\s+женск|женщин|девуш|(?<![а-яё])дам(?![а-яё])|подруг|сестр|жен[еа]\b/i;
const JEWELRY_VIP_BRIEF = /ювелир|jewelry|vip|роскошн|luxury/i;
// Настольный «умный» гаджет / desk-tech (лампа, БЗУ, часы, органайзер, метеостанция…)
const DESKTECH_BRIEF = /настольн|технологичн|гаджет|smart|умн(?:ый|ое|ая|ые)|девайс|desk\s*(?:tech|gadget)/i;
// ЯВНО «технологичный» запрос (сильнее «настольного»): пользователь хочет ИМЕННО технику/гаджеты,
// а не офисные staple (рюкзак/блокнот/термокружка). Триггерит штраф не-технике в правиле desk_tech.
const TECH_FOCUS_BRIEF = /технологичн|технологи[йяю]|высокотехнолог|гаджет|hi-?tech|(?<![а-яё])электроник|(?<![а-яё])девайс|(?<![а-яё])digital|smart[\s-]?(?:девайс|гаджет|устройств|watch|дом)/i;
// «НАСТОЛЬНОЕ» — ПРОСТРАНСТВЕННОЕ ограничение: предмет СТОИТ/ЛЕЖИТ НА СТОЛЕ (подставка/лампа/органайзер
// настольный/беспроводная зарядка-подставка/хаб/часы/метеостанция), а НЕ переносное (рюкзак/сумка/
// папка/клатч/чемодан/флешка — их носят, а не держат на столе). Флешка = тех, но переносная, НЕ настольная.
const DESKTOP_FOCUS_BRIEF = /настольн|(?<![а-яё])на\s+стол(?![а-яё])|для\s+(?:рабочего\s+)?стол[аеи]|на\s+рабоч[а-яё]*\s+стол|desk[\s-]?(?:top|gadget|acc)/i;
// «Не хрупкое / небьющееся» — исключаем стекло/керамику/декор/сувенирные статуэтки
const NOT_FRAGILE_BRIEF = /не\s*хрупк|небьющ|не\s*бьющ|прочн|ударопрочн|not\s*fragile/i;

const NEGATIVE_PATTERNS: Array<{ pattern: RegExp; penaltyTypes: string[]; penalty: number }> = [
  {
    pattern: /(?:избежа|без|не\s+использ|отклон).{0,30}(?:офис|стандартн|традицион)/i,
    penaltyTypes: ['pen', 'pencil', 'notebook', 'planner', 'diary'],
    penalty: -80,
  },
  {
    pattern: /(?:без|не\s+использ).{0,20}пластик/i,
    penaltyTypes: [],
    penalty: -100,
  },
];

/**
 * ТЕМА → ТОВАР (расширяемая таблица стилевых интентов). Если пользователь пишет ТЕМУ в бриф, товар
 * «в тему» получает бонус, а явно «не в тему» — штраф. ДОПОЛНЯЕТ специализированные правила
 * (tech/eco/cozy/sport/premium/creative уже сильные) — сюда кладём то, что они НЕ покрывают:
 * эстетику (минимализм, яркость, элегантность, натуральная фактура) и любые новые темы.
 * **Добавить новую тему = одна строка** (trigger — как узнать тему в брифе; on/off — товар в/не в тему).
 */
export const THEME_INTENTS: Array<{
  id: string;
  trigger: RegExp;
  on: RegExp;
  off?: RegExp;
  boost: number;
  penalty: number;
}> = [
  // ─── СТИЛЬ / ЭСТЕТИКА ───
  {
    id: 'minimalist',
    trigger: /минимал|лаконичн|сдержанн|(?<![а-яё])строг(?:ий|ом|ая|ое|о)?(?![а-яё])|монохром|нейтральн[а-яё]*\s*(?:стиль|дизайн|палитр)|no[\s-]?logo|clean[\s-]?desk/i,
    on: /лаконичн|минимал|монохром|матов|однотонн|(?<![а-яё])строг|графит|(?<![а-яё])soft[\s-]?touch|моно(?![а-яё])/i,
    off: /пёстр|пестр|пайетк|страз|глиттер|блёстк|блестк|мультиколор|неонов|кислотн|мультяшн/i,
    boost: 24,
    penalty: -45,
  },
  {
    id: 'vibrant',
    trigger: /(?<![а-яё])ярк|красочн|цветаст|разноцвет|сочн[а-яё]*\s*цвет|неонов|позитивн|жизнерадостн|весёл|весел[а-яё]*\s*(?:набор|подар)/i,
    on: /ярк|неонов|разноцвет|мультиколор|градиент|(?<![а-яё])микс\s*цвет|(?<![а-яё])стикер|значк|(?<![a-z])badge|позитив|смайл|эмодзи/i,
    off: /монохром|(?<![а-яё])строг[а-яё]*\s*делов|канцеляр[а-яё]*\s*набор/i,
    boost: 22,
    penalty: -22,
  },
  {
    id: 'elegant',
    trigger: /элегантн|изысканн|утончённ|утонченн|благородн|(?<![а-яё])классик[аи]?(?![а-яё])|(?<![a-z])classic|аристократ|интеллигентн|солидн/i,
    on: /кожа|кожан|металл|гравировк|футляр|(?<![a-z])classic|благородн|латун|стальн|дерев[а-яё]*\s*(?:футляр|короб)|перьев[а-яё]*\s*ручк/i,
    off: /пластиков[а-яё]*\s*(?:промо|брелок)|антистресс|(?<![а-яё])мялк|мультяшн/i,
    boost: 22,
    penalty: -30,
  },
  {
    id: 'natural_texture',
    trigger: /натуральн[а-яё]*\s*(?:материал|фактур)|деревянн|из\s+дерева|бамбук|(?<![а-яё])крафт|ремесл|hand[\s-]?made|ручн[а-яё]*\s*работ/i,
    on: /дерев|(?<![a-z])wood|бамбук|крафт|kraft|войлок|(?<![а-яё])лён|(?<![а-яё])лен(?![а-яё])|джут|керамик|hand[\s-]?made/i,
    off: /(?<![а-яё])пластик|синтет|(?<![а-яё])led(?![а-яё])/i,
    boost: 24,
    penalty: -30,
  },
  {
    id: 'vintage_retro',
    trigger: /винтаж|ретро|(?<![a-z])vintage|(?<![a-z])retro|старин|в\s+стиле\s+ретро|олдскул|old[\s-]?school/i,
    on: /винтаж|ретро|латун|состаренн|(?<![а-яё])крафт|дерев|классич|патин|гравировк/i,
    off: /неонов|футуристичн|(?<![а-яё])led(?![а-яё])|(?<![а-яё])смарт|гаджет/i,
    boost: 22,
    penalty: -28,
  },
  {
    id: 'modern_trendy',
    trigger: /современн[а-яё]*\s*(?:стиль|дизайн|подарок|набор|решени)|трендов|модн[а-яё]*\s*(?:стиль|дизайн)|актуальн[а-яё]*\s*дизайн|(?<![a-z])modern/i,
    on: /лаконичн|минимал|(?<![а-яё])smart|умн|soft[\s-]?touch|матов|современн|беспроводн/i,
    off: /статуэтк|сувенирн|плюшев|мультяшн|(?<![а-яё])лубоч/i,
    boost: 20,
    penalty: -22,
  },
  {
    id: 'futuristic',
    trigger: /футуристичн|космическ|hi-?tech\s*вид|высокотехнологичн\s*вид|sci-?fi|киберпанк|инновационн\s*дизайн/i,
    on: /(?<![а-яё])led(?![а-яё])|подсветк|(?<![a-z])rgb|неонов\s*подсвет|(?<![а-яё])smart|умн|голограф|футуристичн|гаджет|беспроводн\s*заряд/i,
    off: /дерев|(?<![а-яё])крафт|войлок|винтаж|состаренн/i,
    boost: 24,
    penalty: -28,
  },
  {
    id: 'monochrome',
    trigger: /монохром|чёрно-?бел|черно-?бел|(?<![а-яё])ч\/б|black\s*(?:&|and)\s*white/i,
    on: /(?<![а-яё])чёрн|(?<![а-яё])черн|(?<![а-яё])бел|graphite|графит|монохром/i,
    off: /разноцвет|неонов|пёстр|пестр|мультиколор|радуж/i,
    boost: 20,
    penalty: -28,
  },
  {
    id: 'pastel',
    trigger: /пастельн|нежн[а-яё]*\s*(?:тон|цвет|оттен|палитр)|мягк[а-яё]*\s*(?:тон|палитр)/i,
    on: /пастельн|нежн|пудров|мятн|лавандов|персиков|светл[а-яё]*\s*(?:розов|голуб|беж)/i,
    off: /(?<![а-яё])чёрн|неонов|кислотн|(?<![а-яё])ярк[а-яё]*\s*(?:красн|син)/i,
    boost: 20,
    penalty: -20,
  },
  {
    id: 'luxury_gold',
    trigger: /роскошн|(?<![а-яё])люкс(?![а-яё])|luxury|дорог[а-яё]*\s*подар|богат[а-яё]*\s*(?:набор|подар)|золот[а-яё]*\s*(?:набор|стиль|подар)|премиальн\s*люкс/i,
    on: /золот|позолот|кожа|кожан|металл|гравировк|футляр|хрустал|латун|premium|(?<![а-яё])люкс/i,
    off: /пластиков[а-яё]*\s*промо|антистресс|(?<![а-яё])брелок\s*промо|(?<![а-яё])мялк/i,
    boost: 24,
    penalty: -40,
  },

  // ─── ФУНКЦИЯ / ОБРАЗ ЖИЗНИ ───
  {
    id: 'travel',
    trigger: /путешеств|(?<![a-z])travel|поездк|командировк|в\s+дорог|для\s+поездок|тревел|для\s+путешествен/i,
    on: /дорожн|органайзер\s*для\s*(?:документ|поездк)|несессер|адаптер|переходник|подушк[а-яё]*\s*(?:дорожн|для\s*ше)|бирк[а-яё]*\s*(?:для\s*)?багаж|(?<![а-яё])чемодан|(?<![а-яё])термос|повербанк|карт[\s-]?холдер|обложк[а-яё]*\s*(?:для\s*)?паспорт/i,
    off: /настольн|хрупк|(?<![а-яё])стекл(?![а-яё])/i,
    boost: 24,
    penalty: -22,
  },
  {
    id: 'wellness_spa',
    trigger: /велнес|(?<![a-z])wellness|(?<![а-яё])спа(?![а-яё])|(?<![a-z])spa(?![a-z])|забот[а-яё]*\s*о\s*себе|оздоров|восстановлен|well-?being/i,
    on: /арома|эфирн\s*масл|диффуз|массаж|бальзам|(?<![а-яё])чай|травян|(?<![а-яё])плед|(?<![а-яё])свеч|соль\s*для\s*ванн|уход|(?<![а-яё])крем/i,
    off: /(?<![а-яё])гаджет|техник|инструмент/i,
    boost: 22,
    penalty: -22,
  },
  {
    id: 'relax_antistress',
    trigger: /антистресс|релакс|расслаблен|снятие\s+стресс|для\s+отдых[а-яё]*\s+и\s+расслаб|(?<![a-z])zen|дзен/i,
    on: /арома|(?<![а-яё])свеч|диффуз|(?<![а-яё])плед|(?<![а-яё])чай|массаж|бальзам|подушк|маск[а-яё]*\s*для\s*сна|бомбочк\s*для\s*ванн/i,
    off: /будильник|таймер|гаджет\s*для\s*работ/i,
    boost: 22,
    penalty: -20,
  },
  {
    id: 'productivity_focus',
    trigger: /продуктивн|тайм[\s-]?менеджмент|фокус[а-яё]*\s*(?:на|для)|эффективн[а-яё]*\s*работ|организац[а-яё]*\s*(?:времен|дня)|(?<![a-z])planning/i,
    on: /ежедневник|планер|(?<![a-z])planner|органайзер|доск[а-яё]*\s*задач|таймер|стикер[\s-]?ноут|(?<![а-яё])ручк|блокнот/i,
    off: /(?<![а-яё])игрушк|антистресс|сувенирн/i,
    boost: 22,
    penalty: -20,
  },
  {
    id: 'coffee',
    trigger: /(?<![а-яё])кофе(?![а-яё])|(?<![a-z])coffee|бариста|эспрессо|для\s+кофеман|кофейн[а-яё]*\s*(?:набор|подар)/i,
    on: /(?<![а-яё])кофе|(?<![a-z])coffee|термокруж|(?<![а-яё])кружк|(?<![а-яё])турк|френч[\s-]?пресс|кофемолк|тампер|гейзер|стакан[а-яё]*\s*для\s*кофе|кофейн/i,
    off: /заварочн\s*чайник/i,
    boost: 24,
    penalty: -12,
  },
  {
    id: 'tea',
    trigger: /(?<![а-яё])чай(?![а-яё])|чайн[а-яё]*\s*(?:набор|церемони|пар)|для\s+чаепит|(?<![a-z])tea(?![a-z])/i,
    on: /(?<![а-яё])чай|заварочн|(?<![а-яё])чайник|термокруж|(?<![а-яё])кружк|чайн[а-яё]*\s*пар|ситечк|(?<![a-z])teapot|инфьюзер/i,
    off: /кофемолк|(?<![а-яё])турк/i,
    boost: 22,
    penalty: -12,
  },
  {
    id: 'reading_books',
    trigger: /(?<![а-яё])чтен|(?<![а-яё])книг|книжн|для\s+чтения|интеллектуальн|literary|букинист/i,
    on: /(?<![а-яё])книг|блокнот|закладк|обложк[а-яё]*\s*для\s*книг|лампа[а-яё]*\s*(?:для\s*чтен|настольн)|очечник|ежедневник|скетчбук/i,
    off: /(?<![а-яё])спорт|фитнес/i,
    boost: 20,
    penalty: -18,
  },
  {
    id: 'gaming',
    trigger: /гейминг|игров[а-яё]*\s*(?:набор|подар|стиль|мыш)|киберспорт|(?<![a-z])esports|(?<![a-z])gaming|геймер/i,
    on: /коврик\s*для\s*мыш|(?<![а-яё])мышь|клавиатур|наушник|гарнитур|подсветк|(?<![a-z])rgb|геймпад|джойстик|коврик\s*игров|(?<![а-яё])led/i,
    off: /классич[а-яё]*\s*делов|ежедневник\s*кожан/i,
    boost: 24,
    penalty: -22,
  },
  {
    id: 'music_audio',
    trigger: /(?<![а-яё])музык|(?<![a-z])audio|меломан|для\s+музык|звук[а-яё]*\s*(?:набор|подар)|(?<![a-z])dj(?![a-z])|(?<![а-яё])винил/i,
    on: /колонк|наушник|гарнитур|(?<![a-z])tws|earbud|(?<![а-яё])винил|(?<![а-яё])аудио|саундбар|микрофон|(?<![а-яё])плеер/i,
    off: /ежедневник\s*делов/i,
    boost: 22,
    penalty: -16,
  },
  {
    id: 'beauty_care',
    trigger: /(?<![а-яё])красот|бьюти|(?<![a-z])beauty|уход[а-яё]*\s*за\s*(?:собой|кож|лиц|волос)|косметичн[а-яё]*\s*набор|(?<![a-z])skincare|макияж/i,
    on: /космет|(?<![а-яё])крем|бальзам|арома|зеркал|несессер|уход|маск[а-яё]*\s*для\s*(?:лиц|волос)|расчёск|массажёр\s*для\s*лиц|сыворотк/i,
    off: /инструмент|(?<![а-яё])нож(?![а-яё])|отвёртк|техник/i,
    boost: 22,
    penalty: -22,
  },
  {
    id: 'kitchen_home',
    trigger: /(?<![а-яё])кухн|для\s+кухни|готовк|кулинар|для\s+дома\s+и\s+кухни/i,
    on: /кухонн|фартук|прихватк|разделочн|доск[а-яё]*\s*кухон|(?<![а-яё])специ|солонк|(?<![а-яё])термос|(?<![а-яё])кружк|полотенц\s*кухон|контейнер/i,
    off: /офисн|канцеляр/i,
    boost: 20,
    penalty: -16,
  },
  {
    id: 'auto_car',
    trigger: /автомобильн|для\s+авто(?![а-яё])|автолюбит|для\s+машин|автомобилист|car\s*(?:acc|gadget)/i,
    on: /автомобильн|для\s+авто|держател[а-яё]*\s*(?:для\s*)?телефон[а-яё]*\s*в\s*авто|органайзер[а-яё]*\s*(?:в\s*)?багажник|зарядк[а-яё]*\s*в\s*авто|компрессор|видеорегистратор|ароматизатор\s*в\s*авто/i,
    off: /настольн\s*лампа/i,
    boost: 22,
    penalty: -14,
  },
  {
    id: 'garden_dacha',
    trigger: /(?<![а-яё])сад(?![а-яё])|(?<![а-яё])дач[а-яё]|для\s+дачи|(?<![а-яё])огород|садов|для\s+сада|барбекю|(?<![а-яё])мангал/i,
    on: /садов|для\s+сада|(?<![а-яё])термос|(?<![а-яё])плед|(?<![а-яё])мангал|барбекю|шампур|складн[а-яё]*\s*(?:стул|мебел)|фонар|дождевик|перчатк\s*садов/i,
    off: /офисн|канцеляр/i,
    boost: 20,
    penalty: -14,
  },
  {
    id: 'kids_family',
    trigger: /(?<![а-яё])детск|для\s+детей|(?<![а-яё])ребён|(?<![а-яё])ребен|семейн|для\s+всей\s+семьи|(?<![а-яё])малыш|(?<![a-z])kids/i,
    on: /(?<![а-яё])детск|(?<![а-яё])игрушк|раскраск|мягк[а-яё]*\s*игрушк|конструктор|(?<![а-яё])пазл|для\s+детей|фломастер|развивающ/i,
    off: /(?<![а-яё])алког|делов[а-яё]*\s*ежедневник|визитниц/i,
    boost: 20,
    penalty: -22,
  },

  // ─── АУДИТОРИЯ / СТИЛЬ ПОДАЧИ ───
  {
    id: 'feminine_style',
    trigger: /женственн|нежн[а-яё]*\s*(?:подар|набор|стиль)|для\s+неё(?![а-яё])|романтичн|дамск[а-яё]*\s*(?:стиль|набор)/i,
    on: /арома|космет|украшен|зеркал|(?<![а-яё])шарф|(?<![а-яё])чай|(?<![а-яё])свеч|уход|шёлк|(?<![а-яё])шелк/i,
    off: /инструмент|отвёртк|(?<![а-яё])нож(?![а-яё])|фляжк|мультитул/i,
    boost: 20,
    penalty: -22,
  },
  {
    id: 'masculine_style',
    trigger: /брутальн|мужск[а-яё]*\s*(?:стиль|характ|набор)|джентльмен|для\s+него(?![а-яё])|мужественн/i,
    on: /кожа|кожан|металл|стальн|(?<![а-яё])термос|мультитул|(?<![а-яё])нож(?![а-яё])|инструмент|(?<![а-яё])фляж|органайзер\s*кабел|барбер/i,
    off: /(?<![а-яё])розов|нежн\s*пастель|пайетк|космети/i,
    boost: 20,
    penalty: -22,
  },
  {
    id: 'corporate_formal',
    trigger: /деловой\s*стиль|официальн[а-яё]*\s*(?:стиль|набор|подар)|строг[а-яё]*\s*(?:стиль|дресс|набор)|представительск|солидн[а-яё]*\s*подар|формальн[а-яё]*\s*(?:стиль|набор)|бизнес[\s-]?класс/i,
    on: /ежедневник|визитниц|(?<![а-яё])ручк|папк[а-яё]*\s*(?:кож|документ)|кожа|футляр|органайзер\s*настольн|держател\s*для\s*визит/i,
    off: /(?<![а-яё])игрушк|антистресс|мультяшн|пайетк|стикер\s*прикол/i,
    boost: 22,
    penalty: -24,
  },
  {
    id: 'casual_relaxed',
    trigger: /неформальн|(?<![a-z])casual|расслабленн[а-яё]*\s*стиль|повседневн[а-яё]*\s*(?:набор|стиль)|(?<![a-z])lifestyle|лайфстайл/i,
    on: /термокруж|рюкзак|стикер|значк|футболк|(?<![а-яё])худи|(?<![а-яё])бутыл|шоппер|повербанк/i,
    off: /визитниц\s*кож|представительск/i,
    boost: 18,
    penalty: -14,
  },
  {
    id: 'festive_celebration',
    trigger: /праздничн|торжеств|(?<![а-яё])юбилей|(?<![a-z])festive|для\s+праздник|поздравительн|годовщин/i,
    on: /подароч|празднич|(?<![а-яё])свеч|гирлянд|открытк|бенгальск|(?<![а-яё])блеск|торжеств|шампанск/i,
    off: /канцеляр\s*набор|офисн\s*расходник/i,
    boost: 18,
    penalty: -12,
  },

  // ─── МАТЕРИАЛ ───
  {
    id: 'leather',
    trigger: /кожан[а-яё]|(?<![а-яё])из\s+кожи|(?<![a-z])leather|натуральн[а-яё]*\s*кож/i,
    on: /кожа|кожан|(?<![a-z])leather|натуральн[а-яё]*\s*кож/i,
    off: /пластиков|силикон|синтет/i,
    boost: 22,
    penalty: -24,
  },
  {
    id: 'metal_steel',
    trigger: /металлическ|(?<![а-яё])из\s+металл|стальн[а-яё]*\s*(?:набор|стиль)|латунн|(?<![a-z])steel|(?<![a-z])metal(?![a-z])/i,
    on: /металл|стальн|латун|(?<![a-z])steel|алюмин|титан|нержавею/i,
    off: /пластиков|силикон/i,
    boost: 20,
    penalty: -20,
  },
  {
    id: 'handmade_craft',
    trigger: /ручн[а-яё]*\s*работ|hand[\s-]?made|крафтов|(?<![а-яё])ремесл|авторск[а-яё]*\s*работ/i,
    on: /ручн[а-яё]*\s*работ|hand[\s-]?made|(?<![а-яё])крафт|войлок|керамик[а-яё]*\s*ручн|авторск|плетён|вязан/i,
    off: /масс[\s-]?маркет|промо[\s-]?штамп/i,
    boost: 22,
    penalty: -20,
  },

  // ─── СЕЗОН (доп. к правилам winter/summer) ───
  {
    id: 'spring',
    trigger: /(?<![а-яё])весенн|(?<![а-яё])весна(?![а-яё])|(?<![a-z])spring/i,
    on: /(?<![а-яё])цвет|светл|пастель|арома|(?<![а-яё])зонт|термокруж|лёгк[а-яё]*\s*плед/i,
    off: /зимн\s*тёпл|тёпл\s*шапк/i,
    boost: 16,
    penalty: -12,
  },
  {
    id: 'autumn',
    trigger: /(?<![а-яё])осенн|(?<![а-яё])осень(?![а-яё])|(?<![a-z])autumn|золот[а-яё]*\s*осен/i,
    on: /(?<![а-яё])плед|(?<![а-яё])тёпл|термокруж|(?<![а-яё])чай|(?<![а-яё])зонт|(?<![а-яё])свеч|(?<![а-яё])уют|(?<![а-яё])шарф/i,
    off: /пляж|летн\s*панам|купальник/i,
    boost: 16,
    penalty: -12,
  },
  // ─── ПРЕДПОЧТЕНИЕ: МНОГОФУНКЦИОНАЛЬНОСТЬ / 2-в-1 ───
  // «интересуют многофункциональные вещи», «универсальные», «2 в 1» → бустим комбо-предметы,
  // штрафуем узкоспециальные однодельные мелочи (значок/наклейка/брелок).
  {
    id: 'multifunctional',
    trigger: /многофункц|мультифункц|multi-?func|универсальн[а-яё]*\s*(?:вещ|гаджет|устройств|предмет|аксессуар|подар|товар)|(?<![а-яё0-9])[23]\s*в\s*1(?![а-яё0-9])|два\s*в\s*одном|три\s*в\s*одном|(?<![а-яё])комбо(?![а-яё])/i,
    on: /мультитул|мультиинструмент|[23]\s*в\s*1|со\s*встроенн|(?<![а-яё])комбо|универсальн|трансформер|органайзер|швейцарск[а-яё]*\s*нож|(?<![а-яё])набор\s*инструм|складн[а-яё]*\s*нож|(?<![а-яё])с\s*функцией|с\s*подсветк|с\s*беспроводн[а-яё]*\s*заряд|док[\s-]?станц/i,
    off: /(?<![а-яё])значок|наклейк|(?<![а-яё])магнит(?![а-яё])|(?<![а-яё])брелок|ланьярд|шнурок\s*для/i,
    boost: 30,
    penalty: -20,
  },
];

export interface BriefRelevanceContext {
  briefNorm: string;
  briefLower: string;
  brandColors: string[];
  forbiddenColors: string[];
  briefTokens: string[];
  flags: {
    summer: boolean;
    winter: boolean;
    cozyWinter: boolean;
    tech: boolean;
    sport: boolean;
    health: boolean;
    youthCreative: boolean;
    eco: boolean;
    picnic: boolean;
    outdoor: boolean;
    creative: boolean;
    vipLuxury: boolean;
    office: boolean;
    salesOnboarding: boolean;
    premium: boolean;
    womensDay: boolean;
    jewelryVip: boolean;
    apparelBrief: boolean;
    sportBriefDarkBan: boolean;
    deskTech: boolean;
    techFocus: boolean;
    desktopFocus: boolean;
    notFragile: boolean;
  };
  activeNegativePatterns: typeof NEGATIVE_PATTERNS;
  activeThemeIntents: typeof THEME_INTENTS;
}

// Мемоизация контекста: он чистая функция от (brief, colors). scoreBriefRelevance
// вызывается десятки тысяч раз за прогон — без кэша каждый раз пересчитываются флаги/
// токены/запрещённые цвета. Кэш безопасен при конкуренции (разные брифы = разные ключи).
const briefContextCache = new Map<string, BriefRelevanceContext>();
const BRIEF_CONTEXT_CACHE_MAX = 64;

export function buildBriefRelevanceContext(
  brief: string,
  brandColors: string[] = [],
): BriefRelevanceContext {
  const key = `${brief} ${brandColors.join('')}`;
  const cached = briefContextCache.get(key);
  if (cached) return cached;
  const ctx = computeBriefRelevanceContext(brief, brandColors);
  if (briefContextCache.size >= BRIEF_CONTEXT_CACHE_MAX) {
    briefContextCache.delete(briefContextCache.keys().next().value as string);
  }
  briefContextCache.set(key, ctx);
  return ctx;
}

function computeBriefRelevanceContext(
  brief: string,
  brandColors: string[] = [],
): BriefRelevanceContext {
  const briefNorm = normalizeText(brief);
  const briefLower = brief.toLowerCase();
  return {
    briefNorm,
    briefLower,
    brandColors,
    forbiddenColors: parseBriefForbiddenColors(brief),
    briefTokens: briefNorm.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 4),
    flags: {
      summer: SUMMER_BRIEF.test(briefNorm),
      winter: WINTER_BRIEF.test(briefNorm),
      cozyWinter: COZY_WINTER_BRIEF.test(briefNorm),
      tech: TECH_BRIEF.test(briefNorm),
      sport: SPORT_BRIEF.test(briefNorm),
      health: HEALTH_BRIEF.test(briefNorm),
      youthCreative: YOUTH_CREATIVE_BRIEF.test(briefNorm),
      eco: ECO_BRIEF.test(briefNorm),
      picnic: PICNIC_BRIEF.test(briefNorm),
      outdoor: OUTDOOR_BRIEF.test(briefNorm),
      creative: CREATIVE_BRIEF.test(briefNorm),
      vipLuxury: VIP_LUXURY_BRIEF.test(briefNorm),
      office: OFFICE_BRIEF.test(briefNorm),
      salesOnboarding: SALES_BRIEF.test(briefNorm),
      premium: PREMIUM_BRIEF.test(briefNorm),
      womensDay: WOMENS_DAY_BRIEF.test(briefNorm),
      jewelryVip: JEWELRY_VIP_BRIEF.test(briefNorm),
      // «мерч» без явной одежды в IT/хакатон-брифе ≠ разрешение на полотенца/салфетки
      apparelBrief:
        /футболк|оверсайз|кепк|панам|очк|фестивал|летн|одежд/i.test(briefNorm) ||
        (/мерч/i.test(briefNorm) && !TECH_BRIEF.test(briefNorm)),
      sportBriefDarkBan: /запрещ.*темн|ярк.*оранж|ярк.*зелен/i.test(briefNorm),
      deskTech: DESKTECH_BRIEF.test(briefNorm),
      techFocus: TECH_FOCUS_BRIEF.test(briefNorm),
      desktopFocus: DESKTOP_FOCUS_BRIEF.test(briefNorm),
      notFragile: NOT_FRAGILE_BRIEF.test(briefNorm),
    },
    activeNegativePatterns: NEGATIVE_PATTERNS.filter((neg) => neg.pattern.test(briefLower)),
    activeThemeIntents: THEME_INTENTS.filter((t) => t.trigger.test(briefNorm)),
  };
}

/**
 * Медицинский бриф (врач/клиника/стоматолог/фарма). Общий детектор — переиспользуется
 * context_gated_novelty (гейт спорт-гаджетов) и правилом health (гейт fitness-бонуса).
 * Гейтим ИМЕННО по медицине, а НЕ по флагу health: у ЗОЖ/фитнес-клуба health=true, но
 * там fitness легитимен.
 */
export function isMedicalBrief(ctx: BriefRelevanceContext): boolean {
  return /врач|медиц|клиник|больниц|(?<![а-яё])доктор|стоматолог|фармац/i.test(ctx.briefNorm);
}

/** Релевантность SKU брифу: отрицательные значения = отсечь */
export function scoreBriefRelevance(
  product: CatalogProduct,
  brief: string,
  brandColors: string[] = [],
  ctx?: BriefRelevanceContext,
): number {
  return scoreBriefRelevanceWithContext(product, ctx ?? buildBriefRelevanceContext(brief, brandColors));
}

/**
 * Сигнал темы: `reject` — жёсткое отсечение (мгновенный возврат значения),
 * `add` — мягкая поправка к сумме.
 */
type RelevanceSignal = { reject: number } | { add: number } | null;

interface RelevanceThemeRule {
  id: string;
  /** Тема активна для данного брифа? */
  active: (ctx: BriefRelevanceContext) => boolean;
  /** Оценка товара в контексте темы. */
  evaluate: (
    product: CatalogProduct,
    type: string,
    text: string,
    ctx: BriefRelevanceContext,
  ) => RelevanceSignal;
}

const reject = (score: number): RelevanceSignal => ({ reject: score });
const add = (score: number): RelevanceSignal => (score ? { add: score } : null);

/**
 * Декларативные правила релевантности по «темам» брифа.
 * Порядок важен: первое `reject` мгновенно отсекает товар (как ранний return).
 * Добавить новый сезон/контекст = добавить одну запись сюда.
 */
const RELEVANCE_THEME_RULES: RelevanceThemeRule[] = [
  {
    id: 'summer',
    active: (ctx) => ctx.flags.summer,
    evaluate: (_p, type, text) => {
      if (type === 'christmas_decor' || /ёлочн|елочн|новогод|рождеств|игрушк/i.test(text)) return reject(-200);
      if (type === 'car_accessory' || /шторк|автомобил|салон авто/i.test(text)) return reject(-150);
      return add(/летн|ярк|неон|фестивал/i.test(text) ? 15 : 0);
    },
  },
  {
    id: 'winter_sunglasses',
    active: (ctx) => ctx.flags.winter,
    evaluate: (_p, type) => add(type === 'sunglasses' ? -20 : 0),
  },
  {
    id: 'offseason_christmas',
    active: (ctx) => !ctx.flags.winter,
    evaluate: (_p, type) => (type === 'christmas_decor' ? reject(-200) : null),
  },
  {
    // КОНТЕКСТ-ГЕЙТ НЕРЕЛЕВАНТНЫХ ГАДЖЕТОВ. Отвёртки/автодержатель/косметическое зеркало/
    // фонарик/коврик для йоги/таймер/шейкер уместны ТОЛЬКО в своём контексте (спорт/пикник/
    // авто/8 марта/ремонт). Вне его — это «случайный novelty не по брифу», который судья
    // справедливо ругает (менеджеру по продажам — отвёртки, врачу — автодержатель). Гейтим
    // по ТЕКСТУ (все эти товары свалены в один тип tech_accessory, по типу не отличить).
    // Важно: НЕ гейтить по флагу health — он true у медицинских брифов, но врач ≠ фитнес.
    id: 'context_gated_novelty',
    active: () => true,
    evaluate: (_p, _type, text, ctx) => {
      const b = ctx.briefNorm;
      // sport-контекст: фитнес/спорт-токены, НО медицинский бриф (врач/клиника) спорт-гаджеты
      // не разрешает — «врач ≠ фитнес» (wellness/зож у не-медицинского брифа разрешают).
      const medical = isMedicalBrief(ctx);
      const sport =
        !medical &&
        (ctx.flags.sport || /фитнес|йог|велнес|wellness|тренаж|зож|пилат|актив[а-яё]*\s*отдых/i.test(b));
      // коврик для йоги/фитнеса (бренд может стоять между «коврик» и «йога» — ловим оба токена)
      if ((/(?:^|[^а-яё])коврик/i.test(text) && /йог|фитнес|пилат|гимнаст|(?<![а-яё])спорт/i.test(text)) ||
          /yoga\s*mat/i.test(text)) {
        if (!sport) return reject(-220);
      }
      // спортивный шейкер
      if (/(?<![а-яё])шейкер|protein\s*shaker/i.test(text) && !sport) return reject(-180);
      // ТАКТИЧЕСКИЙ фонарик (не декоративный/садовый фонарь — тот легитимный подарок):
      // требуем «фонарик» (карманный) или тактические признаки (Лм/люмен/led/налобный/фокусировка).
      if (/(?<![а-яё])фонарик|flashlight|налобн[а-яё]*\s*фонар|тактическ[а-яё]*\s*фонар|фонар[а-яё]*[\s,«»"]*(?:\d+\s*)?(?:лм\b|люмен|led\b)|фонар[а-яё]*\s*(?:с\s*)?фокусиров/i.test(text) &&
          !(ctx.flags.picnic || ctx.flags.outdoor || /поход|турист|кемпинг|рыбалк|охот/i.test(b)))
        return reject(-200);
      // косметическое зеркало
      if (/космет[а-яё]*\s*зеркал|зеркал[а-яё]*\s*(?:космет|для\s*макияж)|makeup\s*mirror/i.test(text) &&
          !(ctx.flags.womensDay || /красот|beauty|космет|уход\s*за\s*соб|велнес/i.test(b)))
        return reject(-200);
      // автодержатель для телефона — ТОЛЬКО явно автомобильный (настольную подставку не трогаем).
      if (/автодержател|автомобильн[а-яё]*\s*держател|держател[а-яё]*\s*(?:для\s*)?(?:телефон|смартфон)\s*(?:в\s*)?(?:авто|машин)/i.test(text) &&
          !/(?:авто|машин|(?<![а-яё])car(?![а-яё])|автомобил|дилер|такси|водител)/i.test(b))
        return reject(-200);
      // отвёртки/биты/шуруповёрт («отвёртка», «отверток» — родит. мн.)
      if (/отв[её]рт|screwdriver|(?:набор|комплект)\s*бит(?![а-яё])|шуруповерт/i.test(text) &&
          !/(?:инструмент|ремонт|мастер|гараж|строит|(?<![а-яё])дач|автосервис)/i.test(b))
        return reject(-220);
      // таймер (мягче — иногда уместен в офисе)
      if (/(?<![а-яё])таймер|time\s*capsule/i.test(text) &&
          !(ctx.flags.office || ctx.flags.deskTech || /тайм-менеджмент|продуктивн|учеб|студен|планир/i.test(b)))
        return add(-95);
      // Outdoor/пляжные ИГРУШКИ (фрисби, ракетки, бадминтон, дартс, возд. змей, «раскраска») —
      // только при спорт/пикник/лето/дети-контексте. Иначе диверсификация пула тащит их в наборы
      // врачей/офиса вместо выбитых fitness-товаров (whack-a-mole: судья «фрисби врачу нерелевантна»).
      if (/фрисби|летающ[а-яё]*\s*тарелк|(?<![а-яё])ракет(?:к|ок)|бадминтон|воздушн[а-яё]*\s*зме|(?<![а-яё])дартс|раскраск|пляжн[а-яё]*\s*(?:мяч|ракет|набор)|кубик[а-яё]*\s*рубик/i.test(text) &&
          !(sport || ctx.flags.picnic || ctx.flags.outdoor || ctx.flags.summer || /дет(?:ям|ск)|фестивал|праздник\s*лета|тимбилдинг|corporate\s*games/i.test(b)))
        return reject(-160);
      return null;
    },
  },
  {
    // Оружейная символика (флешка-патрон АК-47, брелок-пистолет) уместна только военному/
    // охотничьему/страйкбольному брифу. Врачам/офису/8 марта — грубый tone-deaf промах,
    // который живой байер отсекает сразу («как человек в контексте»).
    id: 'weapon_imagery_offtopic',
    active: (ctx) =>
      !/охот|рыбалк|тактическ|страйкбол|арм(?:ия|ейск)|военн|оружейн|силовик|росгвард|стрелков|(?<![а-яё])тир(?![а-яё])|снайп|патриот/i.test(
        ctx.briefNorm,
      ),
    evaluate: (_p, _type, text) => {
      // клеевой/водяной/краскопульт-«пистолет» — легитимный инструмент, не оружие
      if (/клеев|термоклеев|водян|краскопульт|мыльн|силикон/i.test(text)) return null;
      // «AK-47» встречается и латиницей, и кириллицей — ловим оба алфавита
      const weapon =
        /(?<![a-zа-яё0-9])[аa][kк]-?\s?47|калашников|(?<![а-яё])пистолет|револьвер|(?<![а-яё])пуля(?![а-яё])|патрон[а-яё]*\s*(?:от|для)\s*(?:[аa][kк]|автомат|пистолет|оруж)|граната|штык|винтовк|снайперск|боеприпас|(?<![а-яё])оружи/i;
      return weapon.test(text) ? reject(-200) : null;
    },
  },
  {
    id: 'apparel_no_keychain',
    active: (ctx) => ctx.flags.apparelBrief,
    evaluate: (_p, type, text, ctx) =>
      (type === 'keychain' || /обвес|брелок/i.test(text)) && !/брелок|обвес/i.test(ctx.briefNorm)
        ? reject(-200)
        : null,
  },
  {
    id: 'merch_no_misc',
    active: (ctx) => /фестивал|летн|футболк|мерч/i.test(ctx.briefNorm),
    evaluate: (_p, type) => add(type === 'other' ? -30 : 0),
  },
  {
    id: 'car_accessory_offtopic',
    active: (ctx) => !/(?:авто|машин|car\b|автомобил)/i.test(ctx.briefNorm),
    evaluate: (_p, type) => (type === 'car_accessory' ? reject(-150) : null),
  },
  {
    id: 'premium',
    active: (ctx) => ctx.flags.premium || /(?:инвестор|банк)/i.test(ctx.briefNorm),
    evaluate: (product, _type, text) => {
      if (/инструмент|tire|шиномонтаж|набор из \d+/i.test(text)) return reject(-220);
      if (/стикер|наклейк|брелок|обвес|бейдж/i.test(text) && (product.price ?? 0) < 80) return reject(-120);
      // Непрезентабельный для премиума ширпотреб
      if (/пластиков\w*\s+часы|настольн\w*\s+часы|настенн\w*\s+часы|метеостанц|погодн\w*\s+станц/i.test(text)) {
        return reject(-160);
      }
      const price = product.price ?? 0;
      let s = 0;
      // Награждаем СРЕДНЕ-ВЫСОКИЙ ценовой класс (качественные ~1500-3500), но НЕ форсируем
      // мега-дорогие позиции (иначе набор схлопывается в 3 предмета вместо 5).
      if (price >= 1500 && price <= 3500) s += 30;
      else if (price >= 900) s += 12;
      else if (price < 600) s -= 70; // дешёвка топит премиум-набор
      // Материал-бонус снижен 30→15: «премиальность» также награждается archetype/audience-need/
      // desirability — три независимых +30/+48/+24 за ОДИН признак «кожа/металл» схлопывали набор в
      // 3 кожаных предмета вместо 5 (перебивали variety −12). Один умеренный вклад на признак.
      if (/кож|leather|метал|латун|сталь|премиум|premium|parker|pierre|waterman|карбон|carbon/i.test(text)) s += 15;
      return add(s);
    },
  },
  {
    id: 'sales_onboarding',
    active: (ctx) => ctx.flags.salesOnboarding,
    evaluate: (_p, type, text) => {
      if (/костер|винн|для\s+вина|бокал|фитнес|эспандер|скакалк|пазл|приватн|конфиденциальн|выпечк|(?<![а-яё])сыр[а-яё]*|нож[а-яё]*\s*для|семейн|головоломк|(?<![а-яё])кукл|косметичк|(?<![а-яё])гольф|френч-?пресс|(?<![а-яё])стопк|(?<![а-яё])рюмк|(?<![а-яё])shots?(?![а-яё])|штоф|диспенсер|разветвител|новогодн|ёлочн|рождеств|светящ/i.test(text)) {
        return reject(-140);
      }
      // Продажник — активные люди «в полях», работа с клиентами/презентациями. Ровный +30
      // всем офисным типам делал пул «канцелярской свалкой» (судья: «слишком много офисной
      // канцелярии»). Ярусно: профессионально-специфичное (презентации/контакты/мобильность)
      // ВЫШЕ базовой канцелярии.
      let s = 0;
      const profession = ['cardholder', 'powerbank', 'backpack', 'bag', 'thermos_mug', 'thermos', 'watch'];
      const office = ['notebook', 'diary', 'pen', 'bottle', 'tech_accessory', 'flash', 'speaker'];
      // «бейдж» убран из tier-1: бустил дешёвые ланьярды в 4/5 наборов. Ночник — не для продажника.
      if (/ночник/i.test(text)) return reject(-120);
      if (/визитниц|кардхолдер|(?<![а-яё])папк[а-яё]*\s*(?:для\s*)?(?:докум|презентац|руковод)|презентац|органайзер[а-яё]*\s*(?:для\s*)?(?:докум|поездок|путешеств)|ежедневник[а-яё]*\s*(?:с\s*)?(?:раздел|планир|клиент)/i.test(text)) s += 38;
      else if (profession.includes(type)) s += 32;
      else if (office.includes(type)) s += 12;
      // Флоральный/«домашний» дизайн (пионы/цветочки) — не образ продажника (судья: «FLORA.Пионы
      // абсолютно не соответствует»). Штраф-сигнал, не reject: на бедном каталоге не рушит добор.
      if (/пион|цветочн|флора|flora|розочк|сердечк|hygge/i.test(text)) s -= 45;
      return add(s);
    },
  },
  {
    id: 'picnic_outdoor',
    active: (ctx) => ctx.flags.picnic || ctx.flags.outdoor,
    evaluate: (_p, type, text) => {
      if (/вакуумн\w*\s*пробк|штопор|аэратор|охладител\w*.*вин|для\s+вина|селфи|штатив|настольн\w*\s+часы/i.test(text)) {
        return reject(-120);
      }
      let s = 0;
      if (/мяч|фрисби|бадминтон|волан|гамак|мультитул|фонар|кемпинг|поход|термокруж|термос|плед|холодильник|складн\w*\s+(?:стул|кресл|мебель|стол)/i.test(text)) s += 35;
      if (['blanket', 'bottle', 'thermos', 'thermos_mug', 'cooler', 'backpack', 'bag'].includes(type)) s += 20;
      return add(s);
    },
  },
  {
    id: 'womens_day',
    active: (ctx) => ctx.flags.womensDay,
    evaluate: (_p, type, text) => {
      let s = 0;
      // Приятные, эстетичные, «для себя» вещи (мужское/детское/награды уже режет isNeverInGiftSet).
      if (/аром|диффуз|свеч|парф|космет|крем|уход|бьюти|beauty|зеркал|шкатул|украшен|бижутер|шарф|плед|термокруж|кружк|чайн\w*\s*пар|(?<![а-яё])чай(?![а-яё])|кофе|сладост|шоколад|конфет|цвет|tea/i.test(text)) {
        s += 35;
      }
      if (['mug', 'thermos_mug', 'tumbler', 'scarf', 'candle', 'cosmetic', 'jewelry', 'blanket'].includes(type)) s += 20;
      // Утилитарный офис как ОСНОВА подарка на 8 марта — вниз (мягко, контракт не ломаем).
      if (/держател\w*\s+(?:для\s+)?визит|папк|канцеляр\w*\s+набор|швейн|(?<![а-яё])флешк|удлинител|переходник|хаб(?![а-яё])/i.test(text)) {
        s -= 50;
      }
      return add(s);
    },
  },
  {
    id: 'tech_affinity',
    active: (ctx) => ctx.flags.tech,
    evaluate: (product, type, text, ctx) => {
      const catNorm = normalizeText(`${product.category ?? ''} ${product.subcategory ?? ''}`);
      // Жёстко: для IT/хакатона — никаких полотенец/салфеток/мешочков, даже если в брифе «мерч»
      if (
        /полотенц|салфет|мешоч|гостев|микрофибр|войлок|банн|туалетн|упаков|холодильник|cooler\s*bag/i.test(
          text,
        ) &&
        !/футболк|худи|кепк|tshirt|hoodie|cap\b/i.test(text)
      ) {
        return reject(-200);
      }
      if (
        /банн|туалетн|гостев\w*\s+полотен|кухонн\w*\s+полотен/i.test(catNorm) &&
        !ctx.flags.cozyWinter &&
        !ctx.flags.health
      ) {
        return reject(-180);
      }
      if (catNorm.includes('текстил') && !ctx.flags.apparelBrief) {
        return reject(-160);
      }
      if (
        /подарочн\w*\s+набор|welcome\s*pack|superbag|hygge|шарф|косметич|разделочн|кухонн.*полотен|полотенц|мешоч|подарочн\w*\s+меш|гостев\w*\s+полотен|(?:очищающ|чистящ).*салфет|салфетк.*(?:микрофибр|очист|экран|чист)|салфетк(?:а|и)?(?:\s|$)|сумк[аи][\s-]*холодильник|cooler\s*bag|изотерм\w*\s+сумк|войлок.*чехол|чехол.*войлок/i.test(
          text,
        )
      ) {
        return reject(-150);
      }
      let s = 0;
      // Настоящая техника — бустим всегда (для IT-аудитории).
      const TECH_CORE = ['powerbank', 'flash', 'speaker', 'tech_accessory'];
      // Мерч/офис-staple (рюкзак/блокнот/бутылка/одежда) — норм-подарок IT-аудитории, НО при ЯВНОМ
      // «технологичное» (techFocus) пользователь хочет технику, а не мерч — тогда НЕ бустим их
      // (плюс desk_tech даёт им штраф). Иначе tech-affinity перебивал техфокус (рюкзак в «технологичное»).
      const TECH_MERCH = ['notebook', 'pen', 'bottle', 'thermos', 'thermos_mug', 'backpack', 'bag', 'sticker', 'tshirt', 'hoodie', 'cap'];
      if (TECH_CORE.includes(type)) s += 35;
      else if (TECH_MERCH.includes(type) && !ctx.flags.techFocus) s += 35;
      if (type === 'gift_set' || type === 'welcome_pack' || type === 'scarf' || type === 'blanket' || type === 'towel') {
        s -= 60;
      }
      if (type === 'packaging' || type === 'cleaning_cloth') return reject(-180);
      return add(s);
    },
  },
  {
    id: 'desk_tech',
    active: (ctx) => ctx.flags.deskTech,
    evaluate: (_product, type, text, ctx) => {
      let s = 0;
      // Награда настольным гаджетам (по названию/тексту карточки).
      // ВАЖНО: \w НЕ матчит кириллицу — окончания слов через [а-яё]*.
      const gadgetText =
        /лампа|ночник|настольн[а-яё]*\s+свет|беспроводн[а-яё]*\s+заряд|wireless\s*charg|заряд(?:к|н)[а-яё]*[-\s]*(?:станц|устройств|коврик|подставк|док)|док.?станц|(?<![а-яё])часы(?![а-яё])|smart\s*watch|органайзер|метеостанц|погодн[а-яё]*\s+станц|увлажнител|humidif|вентилятор|(?<![а-яё])fan(?![а-яё])|аромадиффуз|диффузор|подставк[а-яё]*\s+для\s+(?:телефон|планшет)|кабель|адаптер|переходник|usb[\s-]?хаб|(?<![а-яё])хаб(?![а-яё])|стилус|веб[\s-]?камер|мышь\s+беспроводн|клавиатур|наушник|гарнитур|(?<![а-яё])tws(?![а-яё])|earbud|подсветк|led|розетк[а-яё]*\s+умн|умн[а-яё]*\s+(?:колонк|лампа|розетк|дом)|trackpad|тачпад|smart[\s-]?(?:лампа|часы|браслет)|фитнес[\s-]?браслет|трекер/i.test(
          text,
        );
      if (gadgetText) s += 45;
      if (['watch', 'speaker', 'powerbank', 'tech_accessory'].includes(type)) s += 20;
      // Флешко-спам вниз (чтобы одиночный гаджет обходил флешки), но не режем совсем.
      if (type === 'flash' || type === 'flash_drive') s -= 45;
      // «НАСТОЛЬНОЕ» (desktopFocus, пространственно): ПЕРЕНОСНОЕ — рюкзак/сумка/папка/клатч/чемодан/
      // флешка — НЕ настольное (его носят, а не держат на столе). Hard-reject → выпадает из пула.
      // Настольные гаджеты (gadgetText) исключены. Пользователь дословно: «рюкзак/папка не настольные,
      // флешка технологична, но не настольная».
      if (ctx.flags.desktopFocus) {
        const CARRY_TYPES = new Set([
          'backpack', 'bag', 'shopper', 'suitcase', 'cosmetic_bag', 'flash', 'flash_drive',
          'raincoat', 'umbrella', 'tshirt', 'hoodie', 'cap', 'scarf', 'socks',
        ]);
        // Сильный сигнал ПЕРЕНОСКИ по имени — reject ДАЖЕ если в названии есть «органайзер»
        // («клатч-органайзер» = переносное, а не настольный органайзер).
        const carryText =
          /рюкзак|(?<![а-яё])сумк|(?<![а-яё])папк[аеи]|портфел|(?<![а-яё])клатч|чемодан|борсетк|несессер|косметичк|поясн[а-яё]*\s+сумк|(?<![а-яё])зонт|(?<![а-яё])флешк|флеш[\s-]?накопит|usb[\s-]?флеш|флеш[\s-]?карт|дорожн[а-яё]*\s+органайзер|органайзер[\s-]*для\s+сумк/i;
        if (carryText.test(text)) return reject(-160);
        // Тип переносной, и это НЕ распознанный настольный гаджет — тоже reject.
        if (CARRY_TYPES.has(type) && !gadgetText) return reject(-160);
      }
      // ЯВНО «технологичное»/«гаджет»/«электроника» (techFocus, сильнее «настольного»): пользователь
      // хочет ТЕХНИКУ, а не офисные staple. Штрафуем НЕ-технику (рюкзак/блокнот/ежедневник/термокружка/
      // сумка/плед/кружка/ручка/полотенце/одежда), кроме того, что уже распознано как гаджет по тексту.
      if (ctx.flags.techFocus && !gadgetText) {
        // Явный не-тех ДЕКОР/уют в технологичном наборе — абсурд (судья/пользователь: «плед,
        // копилка в „технологичном“»). Жёсткий reject → выпадают из пула (негатив не клампится).
        if (
          /(?<![а-яё])плед|копилк|(?<![а-яё])свеч|подсвечник|полотенц|(?<![а-яё])шарф|варежк|перчатк|статуэтк|фигурк|(?<![а-яё])кружк|термокружк|чайн[а-яё]*\s+пар|мягк[а-яё]*\s+игрушк|аромо|бальзам/i.test(
            text,
          )
        ) {
          return reject(-150);
        }
        // Офис-staple (рюкзак/блокнот/ручка/сумка/бутылка) — не декор, но и не техника: сильный
        // штраф, чтобы техника их обходила (не reject — могут добить набор при нехватке гаджетов).
        const NON_TECH = new Set([
          'backpack', 'bag', 'shopper', 'suitcase', 'notebook', 'diary', 'pen', 'pencil',
          'mug', 'thermos', 'thermos_mug', 'tumbler', 'bottle', 'blanket', 'towel', 'scarf',
          'socks', 'tshirt', 'hoodie', 'cap', 'cosmetic_bag', 'tea_set', 'candle', 'umbrella', 'raincoat',
        ]);
        if (NON_TECH.has(type)) s -= 75;
      }
      // Декоративные сувениры/статуэтки/ножи-на-подставке — не в технологичный набор.
      if (
        /статуэтк|фигурк|сувенирн|плакет|трофе|фоторамк|декоратив|нож\w*\s+(?:на\s+)?подставк|подставк\w*\s+.*нож/i.test(
          text,
        )
      ) {
        return reject(-200);
      }
      // Чехол для ноутбука — не «настольное».
      if (/чехол\w*\s+для\s+ноут|laptop\s*sleeve|конверт\w*\s+для\s+ноут/i.test(text)) s -= 60;
      return add(s);
    },
  },
  {
    id: 'not_fragile',
    active: (ctx) => ctx.flags.notFragile,
    evaluate: (_product, type, text) => {
      // Явно хрупкий декор — отсечь.
      if (
        /статуэтк|фигурк|сувенирн\w*\s+нож|нож\w*\s+(?:на\s+)?подставк|плакет|фоторамк|хрустал/i.test(
          text,
        )
      ) {
        return reject(-200);
      }
      // Стекло/керамика — отсечь, КРОМЕ питьевой посуды (стеклянные бутылки/стаканы допустимы).
      const isDrinkware = ['bottle', 'tumbler', 'thermos', 'thermos_mug', 'mug'].includes(type);
      if (!isDrinkware && /(?<![а-яё])стекл|glass|керамик|фарфор|фаянс/i.test(text)) {
        return reject(-150);
      }
      return add(0);
    },
  },
  {
    id: 'sport',
    active: (ctx) => ctx.flags.sport,
    evaluate: (_p, _type, text, ctx) => {
      let s = 0;
      if (/разделочн|ежедневник|блокнот|кружк/i.test(text) && !/спорт|бутыл|полотенц/i.test(text)) s -= 40;
      if (/черн|black|темно[\s-]?син|серый|grey/i.test(text) && ctx.flags.sportBriefDarkBan) s -= 70;
      return add(s);
    },
  },
  {
    id: 'health',
    active: (ctx) => ctx.flags.health,
    evaluate: (_p, type, text, ctx) => {
      if (type === 'christmas_decor' || type === 'car_accessory') return reject(-180);
      if (/сладост|шоколад|конфет|алкогол/i.test(text)) return reject(-150);
      // Врач ≠ фитнес: у медицинского брифа health=true, но скакалка/эспандер/спорт-резинка
      // не «подарок врачу». Гейтим fitness-бонус и спорт-токен по isMedicalBrief (не по флагу
      // health — иначе сломается ЗОЖ/фитнес-клуб, где спорт легитимен). bottle/термос остаются.
      const medical = isMedicalBrief(ctx);
      // Врачу: фляжка = алкоголь, зеркало/ночник/диспенсер = случайный быт, скакалка/эспандер =
      // спорт-игрушка, гольф/френч-пресс/головоломка/стопки = «из другого сценария». REJECT (не
      // просто без бонуса) — иначе relaxed/бюджет-добор тащит их мимо архетип-пула (наблюдалось).
      if (medical && /фляжк|(?<![а-яё])фляг|(?<![а-яё])зеркал|ночник|диспенсер|док[\s-]?станц|скакалк|эспандер|(?<![а-яё])гольф|френч-?пресс|головоломк|(?<![а-яё])пазл|(?<![а-яё])стопк|(?<![а-яё])рюмк|(?<![а-яё])shots?(?![а-яё])/i.test(text))
        return reject(-160);
      // Врачу это не «подарок»: спорт-гаджеты (скакалка/эспандер) И дешёвая игрушка-антистресс.
      const nonGiftToy =
        type === 'fitness' || type === 'stress_ball' ||
        /скакалк|эспандер|резинк[а-яё]*\s*(?:для\s*)?(?:спорт|фитнес)|гантел|антистресс|мялк|сквиш/i.test(text);
      let s = 0;
      // Реальные «здоровье»-предметы. Полотенце НЕ бустим — иначе оно заполоняет весь набор.
      if (['bottle', 'fitness', 'stress_ball', 'thermos', 'tumbler'].includes(type) && !(medical && nonGiftToy)) s += 40;
      if (/здоров|wellness|массаж|витамин|антисептик|санитайзер|аптечк/i.test(text)) s += 25;
      else if (/спорт/i.test(text) && !medical) s += 25;
      if (type === 'towel') s += 10;
      return add(s);
    },
  },
  {
    id: 'youth_creative',
    active: (ctx) => ctx.flags.youthCreative,
    evaluate: (_p, type, text) => {
      let s = 0;
      if (['tshirt', 'hoodie', 'cap', 'bucket_hat', 'sticker', 'speaker', 'sunglasses', 'keychain'].includes(type)) {
        s += 35;
      }
      if ((type === 'pen' || type === 'notebook') && (text.includes('обычн') || /базов|канцеляр/i.test(text))) {
        s -= 70;
      }
      if (type === 'socks' && !/носк/i.test(text)) s -= 80;
      return add(s);
    },
  },
  {
    id: 'eco',
    active: (ctx) => ctx.flags.eco,
    evaluate: (product, type, text) => {
      const ecoMarkers = /wood|дерев|бамбук|эко|переработ|recycl|organic|bio|биоразлаг|крафт|kraft|хлопок.*орган|organic\s*cotton/i;
      const genericOffice = /блокнот\s+a7|сумка\s+для\s+ноутбук|стальн\w*\s+кружк|офисн\w*\s+канц/i;
      if (type === 'packaging' || type === 'cleaning_cloth' || type === 'towel') return reject(-180);
      if (genericOffice.test(text) && !ecoMarkers.test(text)) return reject(-120);
      if (/рождеств|новогод|пластик|синтет/i.test(text) && !ecoMarkers.test(text)) return reject(-80);
      let s = 0;
      if (ecoMarkers.test(text)) s += 35;
      if (['bottle', 'thermos', 'tumbler', 'bag', 'tote'].includes(type) && ecoMarkers.test(text)) s += 20;
      return add(s);
    },
  },
  {
    id: 'winter',
    active: (ctx) => ctx.flags.winter,
    evaluate: (_p, type, text) => {
      // СЕЗОННАЯ СВЯЗНОСТЬ: зимний/новогодний набор ≠ лето/пляж. Пляжный коврик, гамак, мангал,
      // купальник, надувной круг — грубый сезонный оксюморон («пляж в НГ»). Жёсткий reject.
      if (/пляжн|(?<![а-яё])пляж(?![а-яё])|(?<![a-z])beach|купальник|плавк[аи]|(?<![а-яё])сланц|шлёпанц|вьетнамк|надувн[а-яё]*\s*(?:круг|матрас|бассейн)|(?<![а-яё])гамак|(?<![а-яё])веер(?![а-яё])|мангал|барбекю|(?<![a-z])bbq(?![a-z])/i.test(text))
        return reject(-200);
      // Летняя одежда (поло/шорты/короткий рукав) — не новогодний подарок; тёплое (свитер/худи/
      // флис/термо/лонгслив) ок. «поло» с границами слова, чтобы не задеть «полотенце».
      if ((/(?<![а-яё])поло(?![а-яё])|(?<![а-яё])шорты(?![а-яё])|(?<![а-яё])майк[аи](?![а-яё])|борцовк|коротк[а-яё]*\s*рукав/i.test(text)) &&
          !/лонгслив|термо|флис|утепл|свитер|худи/i.test(text))
        return reject(-160);
      return add(/разделочн|путешеств|бейсболк/i.test(text) && !/новогод|рождеств|ёлоч|елоч/i.test(text) ? -80 : 0);
    },
  },
  {
    id: 'cozy_winter',
    active: (ctx) => ctx.flags.cozyWinter,
    evaluate: (_p, type, text) => {
      if (type === 'fitness' || /фитнес|fitness|резинк|эспандер|cross/i.test(text)) return reject(-220);
      if (type === 'raincoat' || /дождевик|ветровк|tornado/i.test(text)) return reject(-200);
      let s = 0;
      if ((type === 'notebook' || type === 'diary') && !/уют|hygge|тепл/i.test(text)) s -= 120;
      if (type === 'socks' || /носк/i.test(text)) s -= 100;
      if (isGiftBundleProductName(text) && !/плед|термос|свеч|hygge|comfort|чай/i.test(text)) s -= 150;
      if (/плед|термос|термокруж|свеч|чай|какао|подушк|hygge|comfort|уют/i.test(text)) s += 45;
      if (/фляг|flask/i.test(text)) return reject(-180);
      return add(s);
    },
  },
  {
    id: 'picnic_outdoor',
    active: (ctx) => ctx.flags.picnic || ctx.flags.outdoor,
    evaluate: (_p, _type, text) => {
      let s = 0;
      if (/носк|обложк.*паспорт|кухонн.*полотен|ежедневник|блокнот/i.test(text) && !/пикник|outdoor/i.test(text)) {
        s -= 90;
      }
      if (/антистресс|стикер|косметич/i.test(text)) s -= 70;
      if (/плед|посуд|бутылк|складн|корзин|термос|пикник/i.test(text)) s += 40;
      return add(s);
    },
  },
  {
    id: 'creative',
    active: (ctx) => ctx.flags.creative,
    evaluate: (_p, type, text) => {
      let s = 0;
      if (/маркер|краск|кист|скетчбук|палитр|ярк/i.test(text)) s += 45;
      if (['sticker', 'speaker', 'sunglasses'].includes(type)) s += 25;
      if ((type === 'notebook' || type === 'diary') && /строг|офисн|делов/i.test(text)) s -= 60;
      if (type === 'thermos' && !/креатив|art/i.test(text)) s -= 35;
      return add(s);
    },
  },
  {
    id: 'vip_luxury',
    active: (ctx) => ctx.flags.vipLuxury || ctx.flags.jewelryVip,
    evaluate: (product, _type, text) => {
      let s = 0;
      if ((product.price ?? 0) >= 400) s += 35;
      if (/кож|металл|бренд|премиум|vip|luxury|эксклюзив/i.test(text)) s += 40;
      if ((product.price ?? 0) < 120 && /стикер|брелок|бейдж|обвес/i.test(text)) s -= 80;
      return add(s);
    },
  },
  {
    id: 'winter_mandatory',
    active: (ctx) => ctx.flags.winter,
    evaluate: (_p, type, text) => {
      let s = 0;
      if (/шарф|перчат|вареж|плед|термокруж|термос/i.test(text)) s += 40;
      if (type === 'scarf' || type === 'beanie' || type === 'blanket') s += 30;
      if (/разделочн|путешеств|бейсболк/i.test(text) && !/новогод|рождеств|ёлоч|елоч/i.test(text)) s -= 80;
      return add(s);
    },
  },
  {
    id: 'picnic',
    active: (ctx) => ctx.flags.picnic,
    evaluate: (_p, _type, text) => {
      let s = 0;
      if (/носк|обложк.*паспорт|кухонн.*полотен|ежедневник|блокнот/i.test(text) && !/пикник|outdoor/i.test(text)) s -= 90;
      if (/плед|термос|бутылк|корзин|набор.*пикник/i.test(text)) s += 35;
      return add(s);
    },
  },
  {
    id: 'office',
    active: (ctx) => ctx.flags.office && !ctx.flags.sport && !ctx.flags.tech,
    evaluate: (_p, type, text, ctx) => {
      if (type === 'fitness' || /фитнес|cross|марафон|спортивн.*инвент/i.test(text)) return reject(-180);
      return add(/бейсболк|кепк/i.test(text) && !/мерч|фестивал/i.test(ctx.briefNorm) ? -50 : 0);
    },
  },
  {
    id: 'jewelry_vip',
    active: (ctx) => ctx.flags.jewelryVip,
    evaluate: (product, _type, text) => {
      if ((product.price ?? 0) < 200 && /брелок|стикер|бейдж|обвес/i.test(text)) return reject(-150);
      let s = 0;
      if (/кож|металл|дерев|хрустал|хрусталь|премиум|vip/i.test(text)) s += 40;
      if (/носк|полотенц|блокнот.*стикер/i.test(text)) s -= 80;
      return add(s);
    },
  },
  {
    id: 'tech_no_apparel',
    active: (ctx) => ctx.flags.tech,
    evaluate: (_p, _type, text, ctx) =>
      add(/бейсболк|носк|поло|футболк/i.test(text) && !/мерч|одежд/i.test(ctx.briefNorm) ? -70 : 0),
  },
  {
    // ОБОБЩЁННАЯ ТЕМА: если бриф назвал тему из THEME_INTENTS (минимализм/яркость/элегантность/
    // натуральность/…), товар «в тему» получает бонус, «не в тему» — штраф. Расширяемо (одна строка).
    id: 'theme_intent',
    active: (ctx) => ctx.activeThemeIntents.length > 0,
    evaluate: (_p, _type, text, ctx) => {
      let s = 0;
      for (const t of ctx.activeThemeIntents) {
        if (t.on.test(text)) s += t.boost;
        else if (t.off && t.off.test(text)) s += t.penalty;
      }
      return add(s);
    },
  },
  {
    // Заготовки-под-печать, кухонная/спец-техника, novelty — это не брендовый подарок.
    // Всегда активно: таким товарам не место в корпоративном наборе.
    id: 'universal_junk',
    active: () => true,
    evaluate: (_p, type, text) => {
      if (type === 'packaging' || type === 'cleaning_cloth') return reject(-200);
      if (
        /мельниц|для\s+специй|разделочн|открывалк|штопор|ситечк|\bтерк\b|половник|шумовк|\bлопатк|зажигалк|пепельниц|кальян|таблетниц|весы\s+для|скребок|очиститель\s+воздух|для\s+велосипед|сублимац|вспениват|кофемолк|турк[ауи]?\b|для\s+барбекю|мангал|для\s+рыбалк|для\s+охот|детск\w+\s+рюкзак|рюкзак\s+сладостей|раскрашивани|для\s+раскраск|кухонн\w+\s+принадлежн|набор\s+кухон|детск\w+\s+набор(?!\s+для\s+рисован)/i.test(
          text,
        )
      ) {
        return reject(-170);
      }
      return null;
    },
  },
  {
    // Зип-пуллы/ремувки — дешёвый филлер; занижаем в деловом/welcome/tech-наборе.
    id: 'corporate_filler',
    active: (ctx) => ctx.flags.tech || ctx.flags.office || ctx.flags.jewelryVip,
    evaluate: (_p, _type, text) => (/ремувк|зип.?пулл|zip\s*pull/i.test(text) ? add(-60) : null),
  },
];

export function scoreBriefRelevanceWithContext(
  product: CatalogProduct,
  ctx: BriefRelevanceContext,
): number {
  const text = productText(product);
  const type = detectConceptProductType(product);
  let score = 0;

  for (const rule of RELEVANCE_THEME_RULES) {
    if (!rule.active(ctx)) continue;
    const signal = rule.evaluate(product, type, text, ctx);
    if (!signal) continue;
    if ('reject' in signal) return signal.reject;
    score += signal.add;
  }

  if (productViolatesColorBan(product, ctx.forbiddenColors)) return -200;

  for (const token of ctx.briefTokens) {
    if (text.includes(token)) score += 6;
  }

  const productTextFull =
    `${product.name} ${product.subcategory ?? ''} ${product.category ?? ''} ${product.description ?? ''}`.toLowerCase();

  for (const neg of ctx.activeNegativePatterns) {
    if (neg.penaltyTypes.length === 0) {
      if (/пластик|пластмасс|plastic|polypropylene|кукурузн.{0,10}крахмал/i.test(productTextFull)) {
        score += neg.penalty;
      }
    } else if (neg.penaltyTypes.includes(type)) {
      score += neg.penalty;
    }
  }

  return score;
}

export function filterCatalogByBriefRelevance(
  catalog: CatalogProduct[],
  brief: string,
  brandColors: string[] = [],
  minKeep = 40,
): CatalogProduct[] {
  const ctx = buildBriefRelevanceContext(brief, brandColors);
  const minScore = ctx.flags.tech
    ? 22
    : ctx.flags.eco
      ? 12
      : ctx.flags.cozyWinter || ctx.flags.jewelryVip
        ? -35
        : -80;

  const fillerFree = catalog.filter((p) => !isCorporateSetFiller(p, brief));
  const source = fillerFree.length >= Math.min(minKeep, 12) ? fillerFree : catalog;

  const scored = source
    .map((p) => ({ product: p, score: scoreBriefRelevanceWithContext(p, ctx) }))
    .filter((s) => s.score > minScore && !isCorporateSetFiller(s.product, brief))
    .sort((a, b) => b.score - a.score);

  if (scored.length >= minKeep) {
    return scored.map((s) => s.product);
  }
  if (scored.length >= Math.max(12, Math.floor(minKeep / 2))) {
    return scored.map((s) => s.product);
  }
  const relaxed = source
    .map((p) => ({ product: p, score: scoreBriefRelevanceWithContext(p, ctx) }))
    .filter((s) => s.score > (ctx.flags.tech ? 5 : -50) && !isCorporateSetFiller(s.product, brief))
    .sort((a, b) => b.score - a.score);
  if (relaxed.length >= 8) return relaxed.map((s) => s.product);
  return fillerFree.length >= 4 ? fillerFree : source;
}
