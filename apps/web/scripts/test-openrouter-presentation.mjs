#!/usr/bin/env node
/** Smoke-test presentation pipeline on server. Run from apps/web with .env loaded. */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
for (const f of [".env", ".env.local"]) {
  try {
    const env = readFileSync(join(dir, f), "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {
    /* optional */
  }
}

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error("NO OPENROUTER_API_KEY");
  process.exit(1);
}

const model = process.env.OPENROUTER_MODEL_PRESENTATION || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
console.log("Testing model:", model);

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: 'Return JSON: {"slides":[{"type":"title","title":"Test"}]}' },
      { role: "user", content: "test presentation" },
    ],
    max_tokens: 500,
    response_format: { type: "json_object" },
  }),
});

const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 500));

if (!res.ok) process.exit(2);
console.log("OK");
