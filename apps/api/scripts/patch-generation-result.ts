import { PrismaClient, GenerationStatus, RequestStatus } from '@prisma/client';

async function main() {
  const generationId = process.argv[2];
  const resultImageUrl = process.argv[3];
  if (!generationId || !resultImageUrl) {
    console.error('Usage: patch-generation-result.ts <generationId> <resultImageUrl>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const gen = await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: GenerationStatus.done,
        resultImageUrl,
        finishedAt: new Date(),
      },
    });
    await prisma.request.update({
      where: { id: gen.requestId },
      data: { status: RequestStatus.done },
    });
    console.log(`Patched generation ${generationId} → ${resultImageUrl}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
