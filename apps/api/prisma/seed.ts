import { PrismaClient } from '@prisma/client';

import { basename, join } from 'path';

import { copyFileSync, existsSync, mkdirSync, statSync } from 'fs';

import { renderCatalogPhoto } from './render-catalog-photo';



const prisma = new PrismaClient();



const UPLOADS_ROOT = join(__dirname, '../../../uploads');

const SOURCE_SILHOUETTES_ROOT = join(__dirname, '../assets/silhouettes');



const SILHOUETTES = [

  '/uploads/silhouettes/tshirt.png',

  '/uploads/silhouettes/hoodie.png',

  '/uploads/silhouettes/mug.png',

  '/uploads/silhouettes/pen.png',

  '/uploads/silhouettes/notebook.png',

  '/uploads/silhouettes/bag.png',

  '/uploads/silhouettes/thermos.png',

  '/uploads/silhouettes/bottle.png',

  '/uploads/silhouettes/cap.png',

  '/uploads/silhouettes/umbrella.png',

  '/uploads/silhouettes/pencil.png',

];



/** Убраны из каталога — некорректные фото карточек */
const RETIRED_PRODUCT_SLUGS = [
  'badge',
  'bottle-sport',
  'earbuds',
  'pen-gel',
  'pen-metal',
  'sticky-notes',
  'usb-16',
  'hoodie-zip',
  'scarf',
] as const;

const PRODUCTS: Array<{ slug: string; name: string; category: string; silhouette: number }> = [

  { slug: 'tshirt-basic', name: 'Футболка базовая', category: 'Текстиль', silhouette: 0 },

  { slug: 'tshirt-premium', name: 'Футболка премиум', category: 'Текстиль', silhouette: 0 },

  { slug: 'tshirt-polo', name: 'Поло', category: 'Текстиль', silhouette: 0 },

  { slug: 'hoodie', name: 'Худи', category: 'Текстиль', silhouette: 1 },

  { slug: 'sweatshirt', name: 'Свитшот', category: 'Текстиль', silhouette: 1 },

  { slug: 'cap', name: 'Кепка', category: 'Текстиль', silhouette: 8 },

  { slug: 'beanie', name: 'Бини', category: 'Текстиль', silhouette: 8 },

  { slug: 'socks', name: 'Носки', category: 'Текстиль', silhouette: 0 },

  { slug: 'mug-ceramic', name: 'Кружка керамическая', category: 'Посуда', silhouette: 2 },

  { slug: 'mug-glass', name: 'Стакан стеклянный', category: 'Посуда', silhouette: 2 },

  { slug: 'thermos', name: 'Термокружка', category: 'Посуда', silhouette: 6 },

  { slug: 'thermos-travel', name: 'Термос дорожный', category: 'Посуда', silhouette: 6 },

  { slug: 'bottle-glass', name: 'Бутылка стеклянная', category: 'Посуда', silhouette: 7 },

  { slug: 'lunchbox', name: 'Ланчбокс', category: 'Посуда', silhouette: 2 },

  { slug: 'plate', name: 'Тарелка', category: 'Посуда', silhouette: 2 },

  { slug: 'pen-ball', name: 'Ручка шариковая', category: 'Канцелярия', silhouette: 3 },

  { slug: 'pencil', name: 'Карандаш', category: 'Канцелярия', silhouette: 10 },

  { slug: 'notebook-a5', name: 'Блокнот A5', category: 'Канцелярия', silhouette: 4 },

  { slug: 'notebook-a6', name: 'Блокнот A6', category: 'Канцелярия', silhouette: 4 },

  { slug: 'notepad', name: 'Блок для записей', category: 'Канцелярия', silhouette: 4 },

  { slug: 'folder', name: 'Папка', category: 'Канцелярия', silhouette: 4 },

  { slug: 'usb-32', name: 'Флешка 32 ГБ', category: 'Электроника', silhouette: 3 },

  { slug: 'powerbank-5000', name: 'Powerbank 5000 mAh', category: 'Электроника', silhouette: 3 },

  { slug: 'powerbank-10000', name: 'Powerbank 10000 mAh', category: 'Электроника', silhouette: 3 },

  { slug: 'wireless-charger', name: 'Беспроводная зарядка', category: 'Электроника', silhouette: 3 },

  { slug: 'speaker', name: 'Портативная колонка', category: 'Электроника', silhouette: 3 },

  { slug: 'shopper', name: 'Шоппер', category: 'Эко', silhouette: 5 },

  { slug: 'tote-bag', name: 'Сумка тоут', category: 'Эко', silhouette: 5 },

  { slug: 'backpack', name: 'Рюкзак', category: 'Эко', silhouette: 5 },

  { slug: 'drawstring-bag', name: 'Мешок для обуви', category: 'Эко', silhouette: 5 },

  { slug: 'seed-kit', name: 'Набор для выращивания', category: 'Эко', silhouette: 5 },

  { slug: 'bamboo-cup', name: 'Бамбуковая кружка', category: 'Эко', silhouette: 2 },

  { slug: 'umbrella', name: 'Зонт', category: 'Аксессуары', silhouette: 9 },

  { slug: 'keychain', name: 'Брелок', category: 'Аксессуары', silhouette: 3 },

  { slug: 'lanyard', name: 'Ланьярд', category: 'Аксессуары', silhouette: 3 },

  { slug: 'gift-box', name: 'Подарочная коробка', category: 'Упаковка', silhouette: 5 },

  { slug: 'gift-bag', name: 'Подарочный пакет', category: 'Упаковка', silhouette: 5 },

  { slug: 'welcome-box', name: 'Welcome Box', category: 'Welcome Pack', silhouette: 5 },

  { slug: 'onboarding-kit', name: 'Onboarding Kit', category: 'Welcome Pack', silhouette: 5 },

  { slug: 'desk-organizer', name: 'Органайзер для стола', category: 'Канцелярия', silhouette: 4 },

  { slug: 'mousepad', name: 'Коврик для мыши', category: 'Канцелярия', silhouette: 4 },

];



function resolveUploadPath(url: string) {

  return join(UPLOADS_ROOT, url.replace(/^\/uploads\/?/, ''));

}

function ensureSeedSilhouette(url: string) {

  const outputPath = resolveUploadPath(url);

  if (existsSync(outputPath)) return;

  const sourcePath = join(SOURCE_SILHOUETTES_ROOT, basename(url));

  if (!existsSync(sourcePath)) {
    throw new Error(`Seed silhouette not found: ${sourcePath}`);
  }

  mkdirSync(join(UPLOADS_ROOT, 'silhouettes'), { recursive: true });
  copyFileSync(sourcePath, outputPath);

}



async function ensureCatalogPhoto(slug: string, name: string, silhouetteUrl: string): Promise<string> {

  const catalogUrl = `/uploads/products/${slug}.png`;

  const outputPath = resolveUploadPath(catalogUrl);

  const silhouettePath = resolveUploadPath(silhouetteUrl);



  const hasPiapiPhoto =
    existsSync(outputPath) && statSync(outputPath).size >= 80_000;

  if (!hasPiapiPhoto) {
    await renderCatalogPhoto({ silhouettePath, outputPath, productName: name });
  }



  return catalogUrl;

}



async function removeRetiredProducts() {
  const retired = await prisma.product.findMany({
    where: { slug: { in: [...RETIRED_PRODUCT_SLUGS] } },
    select: { id: true, slug: true },
  });
  if (retired.length === 0) return;

  const ids = retired.map((p) => p.id);
  await prisma.requestItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${retired.length} retired products: ${retired.map((p) => p.slug).join(', ')}`);
}

async function main() {

  console.log('Seeding products + catalog photos...');

  await removeRetiredProducts();

  for (const silhouetteUrl of SILHOUETTES) {
    ensureSeedSilhouette(silhouetteUrl);
  }

  for (const p of PRODUCTS) {

    const silhouetteImageUrl = SILHOUETTES[p.silhouette];

    const catalogImageUrl = await ensureCatalogPhoto(p.slug, p.name, silhouetteImageUrl);



    await prisma.product.upsert({

      where: { slug: p.slug },

      update: {

        name: p.name,

        category: p.category,

        silhouetteImageUrl,

        catalogImageUrl,

      },

      create: {

        slug: p.slug,

        name: p.name,

        category: p.category,

        silhouetteImageUrl,

        catalogImageUrl,

      },

    });

  }

  console.log(`Seeded ${PRODUCTS.length} products with catalog photos.`);

}



main()

  .catch((e) => {

    console.error(e);

    process.exit(1);

  })

  .finally(async () => {

    await prisma.$disconnect();

  });


