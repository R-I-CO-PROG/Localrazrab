/**
 * Удаляет все сгенерированные AI-фото из БД и папки uploads/generated.
 * Запуск: npx tsx scripts/purge-generated-images.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { readdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

function getUploadsGeneratedDir(): string {
  return process.env.UPLOADS_DIR
    ? join(process.env.UPLOADS_DIR, 'generated')
    : join(process.cwd(), 'uploads', 'generated');
}

async function main() {
  const deletedVariants = await prisma.visualizationVariant.deleteMany({});
  const updatedGenerations = await prisma.generation.updateMany({
    data: {
      resultImageUrl: null,
      conceptResults: Prisma.DbNull,
      status: 'done',
    },
  });

  let deletedFiles = 0;
  const dir = getUploadsGeneratedDir();
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (/\.(png|jpg|jpeg|webp)$/i.test(name)) {
        try {
          unlinkSync(join(dir, name));
          deletedFiles += 1;
        } catch {
          /* ignore locked files */
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        deletedVariants: deletedVariants.count,
        updatedGenerations: updatedGenerations.count,
        deletedFiles,
        generatedDir: dir,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
