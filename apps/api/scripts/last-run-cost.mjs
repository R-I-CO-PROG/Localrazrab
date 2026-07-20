import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const PRICING = {
  'anthropic/claude-3-5-haiku': { input: 0.8, output: 4.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'black-forest-labs/flux.2-klein-4b': { perMpFirst: 0.014, perMpNext: 0.001 },
  'google/gemini-2.5-flash-image': {
    inputPerM: 0.3,
    outputPerM: 2.5,
    outputTokensPerImage: 1290,
  },
};

function jsonSize(obj) {
  try {
    return JSON.stringify(obj ?? '').length;
  } catch {
    return 0;
  }
}

function estimateTokens(chars) {
  return Math.ceil(chars / 4);
}

function textCost(model, inputTokens, outputTokens) {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

function fluxMpCost(mp, count = 1) {
  const p = PRICING['black-forest-labs/flux.2-klein-4b'];
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += p.perMpFirst + Math.max(0, mp - 1) * p.perMpNext;
  }
  return total;
}

function geminiImageCost(inputTokens, imageCount = 1) {
  const p = PRICING['google/gemini-2.5-flash-image'];
  const outTokens = p.outputTokensPerImage * imageCount;
  return (inputTokens / 1e6) * p.inputPerM + (outTokens / 1e6) * p.outputPerM;
}

async function main() {
  const run = await prisma.agentRun.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      request: { include: { generation: true, assets: true } },
    },
  });

  if (!run) {
    console.log('NO_RUN');
    return;
  }

  const gen = await prisma.generation.findFirst({
    where: { requestId: run.requestId },
    orderBy: { startedAt: 'desc' },
  });

  const ideatorOut = estimateTokens(jsonSize(run.ideatorOutput));
  const criticOut = estimateTokens(jsonSize(run.criticOutput));
  const promptOut = estimateTokens(jsonSize(gen?.llmOutput));

  // Conservative input estimates from prompt templates + brief
  const briefChars = run.request.userPrompt.length + 500;
  const ideatorIn = estimateTokens(2800 + briefChars);
  const criticIn = estimateTokens(1800 + jsonSize(run.ideatorOutput));
  const promptIn = estimateTokens(1400 + jsonSize(run.criticOutput) + briefChars);

  const previewMp = 0.786; // Flux Klein default ~1024×768
  const previewResolution = '1024x768';
  const finalMp = 1.049; // measured 1024x1024

  const breakdown = {
    run: {
      requestId: run.requestId,
      title: run.request.title,
      brief: run.request.userPrompt,
      chosenConcept: run.chosenIdeaTitle,
      agentFinished: run.finishedAt,
      generationFinished: gen?.startedAt,
    },
    steps: {
      ideator: {
        model: 'anthropic/claude-3-5-haiku',
        estInputTokens: ideatorIn,
        estOutputTokens: ideatorOut,
        usd: textCost('anthropic/claude-3-5-haiku', ideatorIn, ideatorOut),
      },
      critic: {
        model: 'openai/gpt-4o-mini',
        estInputTokens: criticIn,
        estOutputTokens: criticOut,
        usd: textCost('openai/gpt-4o-mini', criticIn, criticOut),
      },
      promptBuilder: {
        model: 'openai/gpt-4o-mini',
        estInputTokens: promptIn,
        estOutputTokens: promptOut,
        usd: textCost('openai/gpt-4o-mini', promptIn, promptOut),
      },
      previews: {
        model: 'black-forest-labs/flux.2-klein-4b',
        count: 5,
        resolution: previewResolution,
        megapixelsEach: previewMp,
        usdPerImage: 0.014,
        usd: 0.014 * 5,
      },
      finalImage: {
        model: 'google/gemini-2.5-flash-image',
        resolution: '1024x1024',
        megapixels: finalMp,
        estInputTokens: estimateTokens(900 + (gen?.llmOutput?.image_prompt?.length ?? 800)),
        usd: geminiImageCost(estimateTokens(900 + (gen?.llmOutput?.image_prompt?.length ?? 800)), 1),
      },
    },
  };

  const totalUsd = Object.values(breakdown.steps).reduce((s, x) => s + x.usd, 0);

  console.log(
    JSON.stringify(
      {
        ...breakdown,
        totalUsd: Number(totalUsd.toFixed(4)),
        totalUsdRubApprox: Number((totalUsd * 92).toFixed(2)),
        note:
          'Оценка по тарифам OpenRouter + размерам файлов из последнего прогона. Точную сумму можно сверить в openrouter.ai/activity.',
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
