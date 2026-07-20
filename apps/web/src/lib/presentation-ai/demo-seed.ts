import type { PresentationGenerationInput } from "./types";

export const GTNT_DEMO_SEED: PresentationGenerationInput = {
  brand: {
    name: "GTNT",
    description: "Мультисервисный оператор связи",
    colors: ["#001A3D", "#005BFF", "#FFFFFF"],
    website: "https://gtnt.ru",
  },
  products: [
    {
      id: "ornaments",
      name: "Новогодний набор шаров",
      category: "Праздничный мерч",
      description: "Фирменные ёлочные шары в стильной упаковке",
    },
    {
      id: "sabo",
      name: "Фирменные сабо GTNT",
      category: "Одежда",
      description: "Удобная обувь для отдыха и повседневного использования",
    },
    {
      id: "laptop-case",
      name: "Чехол-органайзер GTNT",
      category: "Аксессуары",
      description: "Чехол для ноутбука и аксессуаров",
    },
    {
      id: "sweater",
      name: "Вязаный джемпер GTNT",
      category: "Одежда",
      description: "Корпоративный джемпер с фирменным паттерном",
    },
    {
      id: "thermos",
      name: "Термос MAGNE",
      category: "Питьевая посуда",
      description: "Вакуумный термос с магнитной крышкой-чашкой",
    },
  ],
  occasion: "Новый год",
  audience: "сотрудники, клиенты и партнёры",
  language: "ru",
  slideCount: 8,
  stylePreset: "premium_dark_tech",
  quality: "premium",
  outputFormats: ["pdf", "pptx", "html"],
  showPrices: false,
};

export const OFFICE_DEMO_SEED: PresentationGenerationInput = {
  brand: {
    name: "Mercai",
    description: "Корпоративные подарки и мерч",
    colors: ["#1B3A6B", "#3B82F6"],
  },
  products: [
    {
      id: "pen",
      name: "Ручка шариковая Bright Pop",
      category: "Канцелярия",
      description: "Яркая ручка для ежедневных заметок и встреч",
    },
    {
      id: "cofer",
      name: "Кофер софт-тач KIDEX 8s",
      category: "Сумки",
      description: "Мягкий кофер с фирменным брендированием",
    },
    {
      id: "pencil",
      name: "Столярный карандаш VETA",
      category: "Канцелярия",
      description: "Качественный карандаш для офиса и творческих задач",
    },
  ],
  occasion: "Корпоративный подарок",
  audience: "Сотрудники",
  language: "ru",
  slideCount: 6,
  stylePreset: "premium_dark_tech",
  quality: "premium",
  outputFormats: ["pptx", "html"],
  showPrices: false,
};
