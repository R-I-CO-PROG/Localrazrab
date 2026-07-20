import type { TaskTemplate } from "@/lib/types";

export const SYSTEM_TEMPLATES: TaskTemplate[] = [
  {
    id: "welcome-it",
    name: "Welcome Pack для IT-команды",
    description:
      "Современный набор для онбординга разработчиков и дизайнеров: практичные предметы, tech-эстетика, акцент на бренд.",
    categoryPreset: "WELCOME_PACK",
    budget: 3500,
    quantity: 100,
    allowedItems: ["Электроника", "Ежедневники и блокноты", "Ручки", "Подарочные наборы"],
    isSystem: true,
  },
  {
    id: "conference",
    name: "Набор для конференции",
    description:
      "Подарки участникам митапа или конференции: узнаваемый стиль, удобные носители бренда, укладка в бюджет.",
    categoryPreset: "CONFERENCE",
    budget: 1500,
    quantity: 500,
    allowedItems: ["Ежедневники и блокноты", "Ручки", "Сумки и рюкзаки", "Подарочные наборы"],
    isSystem: true,
  },
  {
    id: "new-year",
    name: "Новогодние подарки сотрудникам",
    description:
      "Праздничный корпоративный набор: тёплая подача, подарочная упаковка, сбалансированный состав под тираж.",
    categoryPreset: "NEW_YEAR",
    budget: 5000,
    quantity: 200,
    allowedItems: ["Термосы и бутылки", "Свечи и подсвечники", "Кружки", "Подарочные наборы"],
    isSystem: true,
  },
  {
    id: "client-gifts",
    name: "Подарки VIP-клиентам",
    description:
      "Премиальный набор для ключевых клиентов: качественные материалы, аккуратная визуализация, сильный бренд-акцент.",
    categoryPreset: "CLIENT_GIFTS",
    budget: 8000,
    quantity: 50,
    allowedItems: ["Электроника", "Кошельки и монетницы", "Термосы и бутылки", "Подарочные наборы"],
    isSystem: true,
  },
  {
    id: "hr-event",
    name: "HR-мероприятие",
    description:
      "Набор для внутреннего HR-события: дружелюбный тон, практичные позиции, готовность к КП и презентации.",
    categoryPreset: "HR_EVENT",
    budget: 2000,
    quantity: 150,
    allowedItems: ["Одежда", "Ежедневники и блокноты", "Сумки и рюкзаки", "Зонты"],
    isSystem: true,
  },
  {
    id: "partner",
    name: "Подарки партнёрам",
    description:
      "Деловой набор для партнёров и инвесторов: сдержанный стиль, понятная ценность, удобно для коммерческого предложения.",
    categoryPreset: "PARTNER_GIFTS",
    budget: 10000,
    quantity: 30,
    allowedItems: ["Электроника", "Термосы и бутылки", "Кошельки и монетницы", "Подарочные наборы"],
    isSystem: true,
  },
];
