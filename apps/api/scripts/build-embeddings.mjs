// build-embeddings.mjs (run on server)
// Reads Product table, computes sentence embeddings for each item,
// writes data/embeddings/products.bin + products-meta.json
//
// Embedding model: paraphrase-multilingual-MiniLM-L12-v2 (384 dims, supports Russian).
// CPU-only. Takes ~5–15 min for 51k items.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const OUT_DIR = process.env.EMBEDDINGS_DIR || '/var/www/Mercai-v2/data/embeddings';
const MODEL = process.env.EMBED_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BATCH = Number(process.env.EMBED_BATCH || 16);
const LIMIT = process.env.EMBED_LIMIT ? Number(process.env.EMBED_LIMIT) : null;

const prisma = new PrismaClient();

function toText(p) {
  const parts = [
    p.name,
    p.subcategory || p.category,
    p.description,
    Array.isArray(p.colors) ? p.colors.map((c) => c?.name).filter(Boolean).join(', ') : '',
  ].filter(Boolean);
  return parts.join('. ').slice(0, 512);
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  console.log('Loading Product table…');
  const products = await prisma.product.findMany({
    select: {
      id: true,
      externalId: true,
      sourceId: true,
      name: true,
      category: true,
      subcategory: true,
      description: true,
      colors: true,
    },
    take: LIMIT ?? undefined,
    orderBy: { id: 'asc' },
  });
  console.log(`Loaded ${products.length} products`);

  console.log(`Loading embedder ${MODEL}…`);
  const { pipeline } = await import('@xenova/transformers');
  const embedder = await pipeline('feature-extraction', MODEL, { quantized: true });

  const dim = 384;
  const vectors = new Float32Array(products.length * dim);
  const meta = [];

  const t0 = Date.now();
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const texts = batch.map(toText);
    const out = await embedder(texts, { pooling: 'mean', normalize: true });
    // out.data is Float32Array of (batch * dim)
    const data = out.data;
    for (let b = 0; b < batch.length; b++) {
      vectors.set(data.subarray(b * dim, (b + 1) * dim), (i + b) * dim);
      meta.push({
        idx: i + b,
        id: batch[b].id,
        externalId: batch[b].externalId,
        sourceId: batch[b].sourceId,
        category: batch[b].category,
        subcategory: batch[b].subcategory,
        name: batch[b].name,
      });
    }
    if ((i / BATCH) % 50 === 0 || i + BATCH >= products.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${i + batch.length}/${products.length}  ${elapsed}s`);
    }
  }

  console.log(`Writing vectors (${vectors.byteLength / 1024 / 1024 | 0} MB)…`);
  writeFileSync(join(OUT_DIR, 'products.bin'), Buffer.from(vectors.buffer));
  writeFileSync(
    join(OUT_DIR, 'products-meta.json'),
    JSON.stringify({ dim, count: products.length, model: MODEL, builtAt: new Date().toISOString(), items: meta }),
  );
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
