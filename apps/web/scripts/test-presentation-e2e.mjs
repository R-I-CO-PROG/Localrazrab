#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env", ".env.local"]) {
  try {
    readFileSync(join(root, f), "utf8")
      .split("\n")
      .forEach((line) => {
        const clean = line.replace(/\r$/, "");
        const m = clean.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim();
      });
  } catch {
    /* */
  }
}

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error("FAIL: no OPENROUTER_API_KEY");
  process.exit(1);
}

const model = process.env.OPENROUTER_MODEL_PRESENTATION || "openai/gpt-4o-mini";
console.log("1) OpenRouter", model);

const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content:
          'Return JSON only: {"slides":[{"type":"title","title":"T"},{"type":"closing","title":"End"},{"type":"content","title":"A","bullets":["b"]},{"type":"summary","title":"S","bullets":["x"]}]}',
      },
      { role: "user", content: "test" },
    ],
    max_tokens: 800,
    response_format: { type: "json_object" },
  }),
});
const orText = await orRes.text();
if (!orRes.ok || orText.trimStart().startsWith("<")) {
  console.error("FAIL OpenRouter:", orRes.status, orText.slice(0, 300));
  process.exit(2);
}
console.log("   OK", orText.slice(0, 120));

console.log("2) PPTX write");
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR || join(root, "../../uploads");

const PptxGenJS = (await import("pptxgenjs")).default;
const pptx = new PptxGenJS();
const slide = pptx.addSlide();
slide.addText("E2E test Mercai", { x: 1, y: 1, w: 8, h: 1, fontSize: 24 });
const buf = await pptx.write({ outputType: "nodebuffer" });
const outDir = join(process.env.UPLOADS_DIR, "presentations");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `e2e-test-${Date.now()}.pptx`);
writeFileSync(out, buf);
console.log("   OK wrote", out, "bytes", buf.length);
console.log("ALL OK");
