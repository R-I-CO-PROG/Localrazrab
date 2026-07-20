import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
try {
  const count = await p.product.count();
  console.log('Product count:', count);
  const bySource = await p.$queryRaw`
    SELECT "sourceId", COUNT(*)::int as n
    FROM "Product"
    GROUP BY "sourceId"
    ORDER BY n DESC
    LIMIT 15
  `;
  console.log('By source:', JSON.stringify(bySource, null, 2));
} finally {
  await p.$disconnect();
}
