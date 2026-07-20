/* eslint-disable no-unused-vars */
const DEMO = {
  appName: "ULT Concept AI",
  user: { name: "Алексей Петров", plan: "Business" },
  stats: {
    totalProjects: 3,
    totalConcepts: 15,
    averageBudget: 4200,
    creditsUsed: 12,
    creditsRemaining: 38,
  },
  projects: [
    {
      id: "proj-1",
      title: "Welcome IT · Q2",
      category: "Welcome Pack",
      budget: 3500,
      quantity: 150,
      conceptsCount: 5,
      status: "completed",
      generationMode: "catalog",
      createdAt: "2026-06-10T10:00:00.000Z",
    },
    {
      id: "proj-2",
      title: "Конференция DevDays",
      category: "Event Kit",
      budget: 5000,
      quantity: 200,
      conceptsCount: 5,
      status: "completed",
      generationMode: "creative",
      createdAt: "2026-06-08T14:30:00.000Z",
    },
    {
      id: "proj-3",
      title: "HR подарки",
      category: "Corporate Gift",
      budget: 2800,
      quantity: 80,
      conceptsCount: 5,
      status: "draft",
      generationMode: "catalog",
      createdAt: "2026-06-05T09:15:00.000Z",
    },
  ],
  concepts: [
    {
      id: "concept-1",
      name: "Синий и фиолетовый",
      description:
        "Набор для активного отдыха: практичные вещи для пикника и поездок. Сочетание синего и фиолетового в фирменной палитре.",
      totalCost: 3987,
      tags: ["активный отдых", "каталог", "пикник"],
      hasVisualization: true,
      items: [
        { name: "Рюкзак детский Classna", price: 890, image: "assets/img/product-backpack.svg", variant: "белый с синим", stock: 6259 },
        { name: "Пенал прямоугольный", price: 420, image: "assets/img/product-pouch.svg", variant: "фиолетовый", stock: 1200 },
        { name: "Плед флисовый", price: 780, image: "assets/img/product-blanket.svg", variant: "кремовый", stock: 3400 },
        { name: "Шоппер текстильный", price: 650, image: "assets/img/product-tote.svg", variant: "синий", stock: 2100 },
        { name: "Подушка для шеи", price: 520, image: "assets/img/product-pillow.svg", variant: "фиолетовый", stock: 890 },
      ],
    },
    {
      id: "concept-2",
      name: "Tech Minimal",
      description: "Минималистичный набор для IT-команды: аксессуары для рабочего места.",
      totalCost: 4520,
      tags: ["tech", "офис", "минимализм"],
      hasVisualization: false,
      items: [
        { name: "Термокружка 350 мл", price: 980, image: "assets/img/product-tote.svg" },
        { name: "Блокнот A5", price: 320, image: "assets/img/product-pouch.svg" },
        { name: "Ручка металлическая", price: 450, image: "assets/img/product-backpack.svg" },
      ],
    },
    {
      id: "concept-3",
      name: "Eco Welcome",
      description: "Эко-набор из переработанных материалов для новых сотрудников.",
      totalCost: 3100,
      tags: ["эко", "welcome", "устойчивость"],
      hasVisualization: false,
      items: [
        { name: "Эко-сумка", price: 550, image: "assets/img/product-tote.svg" },
        { name: "Бутылка для воды", price: 720, image: "assets/img/product-backpack.svg" },
      ],
    },
    {
      id: "concept-4",
      name: "Premium VIP",
      description: "Премиальный набор для ключевых клиентов с акцентом на качество материалов.",
      totalCost: 8900,
      tags: ["premium", "vip", "подарок"],
      hasVisualization: false,
      items: [
        { name: "Кожаный органайзер", price: 3200, image: "assets/img/product-pouch.svg" },
        { name: "Термос 500 мл", price: 1800, image: "assets/img/product-blanket.svg" },
      ],
    },
    {
      id: "concept-5",
      name: "Event Starter",
      description: "Базовый event-kit для конференций и митапов.",
      totalCost: 2650,
      tags: ["event", "конференция"],
      hasVisualization: false,
      items: [
        { name: "Футболка promo", price: 890, image: "assets/img/product-backpack.svg" },
        { name: "Стикер-пак", price: 150, image: "assets/img/product-pillow.svg" },
        { name: "Блокнот", price: 280, image: "assets/img/product-pouch.svg" },
      ],
    },
  ],
  visualizations: [
    {
      id: "viz-1",
      conceptId: "concept-1",
      conceptName: "Синий и фиолетовый",
      imageUrl: "assets/img/placeholder-scene.svg",
      createdAt: "2026-06-11T16:20:00.000Z",
    },
  ],
  templates: [
    { id: "t1", name: "Welcome IT", category: "Welcome Pack", description: "Онбординг новых сотрудников" },
    { id: "t2", name: "Конференция", category: "Event Kit", description: "Мероприятия и митапы" },
    { id: "t3", name: "Новый год", category: "Corporate Gift", description: "Праздничные подарки" },
    { id: "t4", name: "VIP клиенты", category: "Premium", description: "Премиальные наборы" },
    { id: "t5", name: "HR event", category: "Event Kit", description: "Корпоративные события" },
    { id: "t6", name: "Партнёрам", category: "Corporate Gift", description: "Подарки партнёрам" },
  ],
  brief: {
    description: "Набор для активного отдыха, пикник и поездки. Синий и фиолетовый. 5 товаров.",
    category: "Corporate Gift",
    budget: 4000,
    quantity: 100,
    setItemCount: 5,
    colors: ["#2563EB", "#7C3AED", "#FFFFFF"],
    mode: "catalog",
  },
};

function formatCurrency(n) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

function formatNumber(n) {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function getConceptById(id) {
  return DEMO.concepts.find((c) => c.id === id) || DEMO.concepts[0];
}
