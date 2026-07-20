import type { PresentationIconKey } from "@/lib/brand-palette";
import type { PresentationQuality } from "./types";

export const MAX_PRODUCTS = 20;
export const MAX_SLIDES = 24;
export const MIN_SLIDES = 4;
export const MAX_RETRIES_PREMIUM = 2;
export const MAX_RETRIES_STANDARD = 1;
export const MAX_RETRIES_DRAFT = 0;

export const QA_THRESHOLDS: Record<PresentationQuality, number> = {
  premium: 0.82,
  standard: 0.7,
  draft: 0.55,
};

export const ALLOWED_ICON_KEYS: PresentationIconKey[] = [
  "gift",
  "shield",
  "team",
  "star",
  "leaf",
  "laptop",
  "magnet",
  "thermo",
  "spark",
  "heart",
];

/** Extended semantic keys mapped to existing SVG icons */
export const SEMANTIC_ICON_MAP: Record<string, PresentationIconKey> = {
  gift: "gift",
  shield: "shield",
  temperature: "thermo",
  thermo: "thermo",
  magnet: "magnet",
  comfort: "heart",
  users: "team",
  team: "team",
  laptop: "laptop",
  briefcase: "shield",
  eco: "leaf",
  leaf: "leaf",
  premium: "star",
  star: "star",
  visibility: "spark",
  creativity: "spark",
  spark: "spark",
  storage: "gift",
  pen: "gift",
  package: "gift",
  snowflake: "spark",
  connection: "spark",
  satellite: "spark",
  heart: "heart",
};

export const OCCASION_OPTIONS = [
  "Новый год",
  "Корпоративный подарок",
  "Welcome pack",
  "Конференция",
  "Клиентский подарок",
  "Мерч для сотрудников",
  "VIP подарок",
  "День компании",
] as const;

export const AUDIENCE_OPTIONS = [
  "Сотрудники",
  "Клиенты",
  "Партнёры",
  "VIP",
  "Массовый тираж",
  "Смешанная аудитория",
] as const;

export const STYLE_PRESET_LABELS: Record<string, string> = {
  premium_dark_tech: "Premium Dark Tech",
  minimal_luxury: "Minimal Luxury",
  corporate_light: "Corporate Light",
  new_year_dark: "New Year Dark",
  sport_energy: "Sport Energy",
  eco_natural: "Eco Natural",
};

export const QUALITY_LABELS: Record<PresentationQuality, string> = {
  draft: "Черновик — быстро, без AI-изображений",
  standard: "Стандарт — AI-копирайт + шаблонные фоны",
  premium: "Premium — полная AI-генерация визуалов",
};
