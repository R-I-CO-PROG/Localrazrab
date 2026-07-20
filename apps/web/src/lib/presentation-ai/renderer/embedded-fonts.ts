import { readFile } from "fs/promises";
import { join } from "path";

let regularBase64: string | null = null;
let boldBase64: string | null = null;

function fontDir(): string {
  const candidates = [
    join(process.cwd(), "node_modules/@fontsource/noto-sans/files"),
    join(process.cwd(), "../../node_modules/@fontsource/noto-sans/files"),
    join(process.cwd(), "apps/web/node_modules/@fontsource/noto-sans/files"),
  ];
  return candidates[0];
}

async function loadFontFile(name: string): Promise<string> {
  const dirs = [
    join(process.cwd(), "node_modules/@fontsource/noto-sans/files"),
    join(process.cwd(), "../../node_modules/@fontsource/noto-sans/files"),
    join(process.cwd(), "apps/web/node_modules/@fontsource/noto-sans/files"),
  ];

  let lastError: unknown;
  for (const dir of dirs) {
    try {
      const buffer = await readFile(join(dir, name));
      return buffer.toString("base64");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`Font file not found: ${name}`);
}

export async function getNotoSansFontStyleBlock(): Promise<string> {
  if (!regularBase64) {
    regularBase64 = await loadFontFile("noto-sans-cyrillic-400-normal.woff2");
  }
  if (!boldBase64) {
    boldBase64 = await loadFontFile("noto-sans-cyrillic-700-normal.woff2");
  }

  return `
    <style type="text/css">
      @font-face {
        font-family: 'NotoSans';
        font-weight: 400;
        font-style: normal;
        src: url('data:font/woff2;base64,${regularBase64}') format('woff2');
      }
      @font-face {
        font-family: 'NotoSans';
        font-weight: 700;
        font-style: normal;
        src: url('data:font/woff2;base64,${boldBase64}') format('woff2');
      }
      .title { font-family: 'NotoSans', sans-serif; font-weight: 700; }
      .body { font-family: 'NotoSans', sans-serif; font-weight: 400; }
    </style>
  `;
}
