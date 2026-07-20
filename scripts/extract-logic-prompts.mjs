#!/usr/bin/env node
/**
 * Scans apps/api/src for prompt templates → apps/web/src/data/logic/prompts.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const API_SRC = join(ROOT, 'apps', 'api', 'src');
const OUT = join(ROOT, 'apps', 'web', 'src', 'data', 'logic', 'prompts.json');

const PROMPT_FILES = [
  'agents/prompts.ts',
  'providers/llm/llm-prompts.ts',
  'providers/llm/local-scene-prompt.ts',
  'generation/prompt-builder.ts',
  'generation/llm-image-prompt.ts',
  'generation/catalog-ai-image-prompt.ts',
  'generation/ai-enhance.prompt.ts',
  'generation/hf-flux.prompt.ts',
  'generation/refine-visualization.prompt.ts',
  'generation/product-logo-branding.util.ts',
  'generation/brand-colors.util.ts',
  'providers/llm/finalize-scene-output.ts',
  'providers/image/openrouter-image.provider.ts',
];

function extractFromSource(text, filePath) {
  const items = [];

  const exportRe = /export\s+const\s+(\w+)\s*=\s*`([\s\S]*?)`(?:\s*;|\s*$)/gm;
  let m;
  while ((m = exportRe.exec(text))) {
    items.push({
      id: `${filePath}::${m[1]}`,
      name: m[1],
      type: 'constant',
      file: filePath,
      content: m[2].trim(),
    });
  }

  const fnRe = /export\s+function\s+(\w+)\([^)]*\)[^{]*\{[\s\S]*?return\s+`([\s\S]*?)`;/gm;
  while ((m = fnRe.exec(text))) {
    items.push({
      id: `${filePath}::${m[1]}`,
      name: m[1],
      type: 'function',
      file: filePath,
      content: m[2].trim(),
    });
  }

  const innerFnRe = /export\s+function\s+(\w+)\(/g;
  while ((m = innerFnRe.exec(text))) {
    const fnName = m[1];
    const slice = text.slice(m.index, m.index + 8000);
    const partsRe = /(?:return\s+|\+\s*)`([\s\S]*?)`/g;
    const parts = [];
    let pm;
    while ((pm = partsRe.exec(slice))) parts.push(pm[1].trim());
    if (parts.length > 1) {
      items.push({
        id: `${filePath}::${fnName}`,
        name: fnName,
        type: 'function-composite',
        file: filePath,
        content: parts.join('\n\n---\n\n'),
      });
    }
  }

  return items;
}

const all = [];
const seen = new Set();

for (const rel of PROMPT_FILES) {
  const full = join(API_SRC, rel);
  try {
    const text = readFileSync(full, 'utf8');
    for (const item of extractFromSource(text, `apps/api/src/${rel}`)) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        all.push(item);
      }
    }
  } catch {
    // skip missing
  }
}

const byNameFile = new Map();
for (const item of all) {
  const key = `${item.file}::${item.name}`;
  const existing = byNameFile.get(key);
  if (!existing || item.content.length > existing.content.length) {
    byNameFile.set(key, item);
  }
}

const deduped = [...byNameFile.values()].sort(
  (a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name),
);

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), prompts: deduped }, null, 2));
console.log(`Wrote ${deduped.length} prompts → ${relative(ROOT, OUT)}`);
