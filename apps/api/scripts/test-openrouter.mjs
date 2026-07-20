import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(dir, '../.env'), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim();

const key = get('OPENROUTER_API_KEY');
const models = [
  'openrouter/free',
  'nvidia/nemotron-nano-9b-v2:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
];

const system =
  'You are a merchandise art director. Reply ONLY with valid JSON, no markdown. Keys: items, composition, style, image_prompt, negative_prompt.';
const user = JSON.stringify({
  task: '1 бутылка для спортзала',
  user_products: ['Бутылка спортивная'],
  colors: ['#7C5CFC', '#1A1A1A'],
  lock_user_products: true,
});

async function tryModel(model) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'http://localhost:3000',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2500,
      temperature: 0.3,
    }),
  });
  const text = await res.text();
  if (!res.ok) return { model, status: res.status, err: text.slice(0, 200) };
  const data = JSON.parse(text);
  const msg = data.choices?.[0]?.message ?? {};
  const content = typeof msg.content === 'string' ? msg.content : '';
  const reasoning = msg.reasoning ?? '';
  const pick = content.trim() || (reasoning.includes('{') ? reasoning : '');
  let parsed = false;
  try {
    if (pick) JSON.parse(pick.match(/\{[\s\S]*\}/)?.[0] ?? pick);
    parsed = Boolean(pick);
  } catch {
    parsed = false;
  }
  return {
    model,
    status: res.status,
    finish: data.choices?.[0]?.finish_reason,
    contentLen: content.length,
    reasoningLen: reasoning.length,
    parsed,
    preview: (content || reasoning).slice(0, 120),
  };
}

for (const m of models) {
  console.log(await tryModel(m));
}
