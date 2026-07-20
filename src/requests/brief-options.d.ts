export declare const BRIEF_CATEGORIES: readonly ["Welcome Pack", "Корпоративные подарки", "Мерч", "Event Kit"];
export declare const BRIEF_ALLOWED_CATEGORIES: readonly ["Одежда", "Сумки и рюкзаки", "Термосы и бутылки", "Кружки", "Ручки", "Ежедневники и блокноты", "Электроника", "Подарочные наборы", "Отдых и спорт", "Зонты", "Посуда", "Офис и канцелярия", "Сувениры и награды", "Солнцезащитные очки", "Свечи и подсвечники", "Аксессуары для путешествий", "Кошельки и монетницы", "Мультитулы", "Текстиль"];
export declare const BRIEF_FORBIDDEN_OPTIONS: readonly ["Алкоголь", "Еда", "Одежда", "Косметика", "Стекло", "Другое"];
export type BriefCategory = (typeof BRIEF_CATEGORIES)[number];
export type BriefAllowedCategory = (typeof BRIEF_ALLOWED_CATEGORIES)[number];
export type BriefForbiddenOption = (typeof BRIEF_FORBIDDEN_OPTIONS)[number];
