/**
 * LLM-тегирование каталога: проставляет Product.material и Product.characteristics по
 * name+description для товаров, у которых material ещё не проставлен (material IS NULL).
 * Батчами (BATCH_SIZE карточек на один LLM-вызов), с ретраями и чекпоинтом по offset — можно
 * прерывать и перезапускать, уже протеганные (material IS NOT NULL) не трогает.
 *
 * Запуск:
 *   npx tsx prisma/tag-products-material.ts            — весь каталог без material
 *   npx tsx prisma/tag-products-material.ts --limit=100 — тестовый прогон на первых 100
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  try {
    const text = readFileSync(join(__dirname, '../.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env optional if vars already exported */
  }
}
loadEnv();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.env.TAG_MODEL || process.env.BRIEF_PARSE_MODEL || 'anthropic/claude-haiku-4.5';
const BATCH_SIZE = 20;
const CONCURRENCY = 4;

interface Row {
  id: string;
  name: string;
  description: string | null;
}

interface TagResult {
  id: string;
  material: string | null;
  characteristics: string[];
}

const SYSTEM_PROMPT = `Ты — товарный классификатор промо-каталога (сувенирная продукция). На вход — список товаров
(id, name, description). Для КАЖДОГО товара определи:

1. material — ОДНО главное слово/короткая фраза материала В ИМЕНИТЕЛЬНОМ ПАДЕЖЕ, ЕДИНСТВЕННОМ
   ЧИСЛЕ, строчными буквами, на том языке, на котором он написан в тексте (обычно русский, но
   если в тексте только английский термин типа "soft touch" — верни его как есть латиницей).
   Примеры: "кожа", "дерево", "металл", "хлопок", "пластик", "стекло", "керамика", "бамбук",
   "силикон", "soft touch", "экокожа". Если материал не упомянут явно или товар смешанный/составной
   без доминирующего материала (например, электронный гаджет без указания корпуса) — верни null.
   НЕ придумывай материал, если его нет в тексте.

2. characteristics — массив 0-5 коротких тегов-характеристик из текста: способ нанесения не
   учитывать, только физические/функциональные свойства товара. Примеры: "водостойкий",
   "складной", "беспроводной", "с подсветкой", "USB-C", "антибактериальный", "многоразовый",
   "термо", "светоотражающий". Каждый тег — 1-3 слова, строчными буквами. Если явных характеристик
   в тексте нет — пустой массив [].

Верни СТРОГО JSON без markdown-разметки: {"items":[{"id":"...","material":"..."|null,"characteristics":["..."]}]}
Порядок и количество элементов items ДОЛЖНЫ точно соответствовать входному списку (по id).`;

async function callLlm(rows: Row[]): Promise<TagResult[]> {
  const userContent = JSON.stringify(
    rows.map((r) => ({ id: r.id, name: r.name, description: (r.description || '').slice(0, 500) })),
  );

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 2500,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content || '';
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : raw.trim();
  const parsed = JSON.parse(jsonText) as { items: TagResult[] };
  if (!Array.isArray(parsed.items)) throw new Error('LLM response missing items[]');
  return parsed.items;
}

async function callLlmWithRetry(rows: Row[], retries = 2): Promise<TagResult[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callLlm(rows);
    } catch (err) {
      if (attempt === retries) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  retry ${attempt + 1}/${retries} after error: ${msg.slice(0, 150)}`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing (check apps/api/.env)');

  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

  const prisma = new PrismaClient();
  const rows: Row[] = await prisma.$queryRawUnsafe(
    `SELECT id, name, description FROM "Product" WHERE "materialTagged" = false ORDER BY "createdAt" ASC ${
      limit ? `LIMIT ${limit}` : ''
    }`,
  );
  console.log(`To tag: ${rows.length} products (model=${MODEL}, batch=${BATCH_SIZE}, concurrency=${CONCURRENCY})`);

  const batches: Row[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

  let done = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (batch) => {
        try {
          const results = await callLlmWithRetry(batch);
          const byId = new Map(results.map((r) => [r.id, r]));
          await Promise.all(
            batch.map(async (row) => {
              const tag = byId.get(row.id);
              if (!tag) return;
              await prisma.product.update({
                where: { id: row.id },
                data: {
                  material: tag.material || null,
                  characteristics: Array.isArray(tag.characteristics) ? tag.characteristics.slice(0, 5) : [],
                  materialTagged: true,
                },
              });
              updated++;
            }),
          );
        } catch (err) {
          failed += batch.length;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Batch failed (${batch.length} items): ${msg.slice(0, 200)}`);
        }
        done += batch.length;
      }),
    );
    console.log(`${done}/${rows.length} processed (updated=${updated}, failed=${failed})`);
  }

  console.log(`DONE. updated=${updated} failed=${failed} total=${rows.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
