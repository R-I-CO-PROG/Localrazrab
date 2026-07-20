import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const g = await p.generation.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      request: {
        include: { items: { include: { product: true } } },
      },
    },
  });
  if (!g) {
    console.log('no generations');
    return;
  }
  const debug = g.debug as Record<string, unknown> | null;
  console.log(
    JSON.stringify(
      {
        id: g.id,
        status: g.status,
        createdAt: g.createdAt,
        resultImageUrl: g.resultImageUrl,
        requestId: g.requestId,
        requestStatus: g.request?.status,
        products: g.request?.items?.map((i) => i.product.name),
        debugImage: debug?.image,
        resultMeta: (g.llmOutput as Record<string, unknown> | null)?._resultMeta,
        error: (g.llmOutput as Record<string, unknown> | null)?._error,
      },
      null,
      2,
    ),
  );
}

main().finally(() => p.$disconnect());
