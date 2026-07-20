import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const count = await prisma.product.count();
  console.log('COUNT', count);

  const decanters = await prisma.product.findMany({
    where: { subcategory: { contains: 'декантер', mode: 'insensitive' } },
    take: 3,
    select: { name: true, category: true, subcategory: true },
  });
  console.log('DECANTERS', JSON.stringify(decanters, null, 2));

  const shakers = await prisma.product.findMany({
    where: { subcategory: { contains: 'шейкер', mode: 'insensitive' } },
    take: 3,
    select: { name: true, category: true, subcategory: true },
  });
  console.log('SHAKERS', JSON.stringify(shakers, null, 2));

  const dist = await prisma.$queryRaw`
    SELECT category, COUNT(*)::int as cnt
    FROM "Product"
    GROUP BY category
    ORDER BY cnt DESC
    LIMIT 15`;
  console.log('CATEGORY_DIST', JSON.stringify(dist));

  const subdist = await prisma.$queryRaw`
    SELECT split_part(subcategory, ' / ', 1) as root, COUNT(*)::int as cnt
    FROM "Product"
    WHERE subcategory IS NOT NULL
    GROUP BY root
    ORDER BY cnt DESC
    LIMIT 10`;
  console.log('IMBA_ROOT', JSON.stringify(subdist));
} finally {
  await prisma.$disconnect();
}
