export const APP_NAME = "Мерцай";
export const APP_DESCRIPTION =
  "AI-платформа для автоматического подбора концепций корпоративной сувенирной продукции";

/** Скачивание/экспорт PPTX в UI. */
export const PPTX_EXPORT_ENABLED = true;

export const NAV_ITEMS = [
  { href: "/generate", label: "AI Генерация", icon: "Sparkles" },
  { href: "/concepts", label: "Мои проекты", icon: "Layers" },
  { href: "/visualizations", label: "Визуализации", icon: "Image" },
  { href: "/proposals", label: "КП и презентации", icon: "FileText" },
  { href: "/brandbooks", label: "Брендбук и лого", icon: "BookOpen" },
  { href: "/templates", label: "Шаблоны задач", icon: "LayoutTemplate" },
  { href: "/favorites", label: "Избранное", icon: "Heart" },
  { href: "/settings", label: "Настройки", icon: "Settings" },
] as const;

export const PLANS = [
  {
    id: "STARTER",
    name: "Starter",
    price: 2990,
    credits: 50,
    features: [
      "50 кредитов в месяц",
      "5 концепций за генерацию",
      "Экспорт PDF",
      "Базовая поддержка",
    ],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: 9990,
    credits: 500,
    popular: true,
    features: [
      "500 кредитов в месяц",
      "AI визуализации",
      "Экспорт PDF, PPTX, DOCX",
      "Приоритетная поддержка",
      "Шаблоны задач",
    ],
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: null,
    credits: -1,
    features: [
      "Безлимитные кредиты",
      "Персональный менеджер",
      "API доступ",
      "Кастомные интеграции",
      "SLA 99.9%",
    ],
  },
] as const;
