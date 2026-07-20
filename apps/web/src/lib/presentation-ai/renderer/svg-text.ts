import * as opentype from "opentype.js";
import { readFile } from "fs/promises";
import { join } from "path";

let regularFont: opentype.Font | null = null;
let boldFont: opentype.Font | null = null;

async function resolveFontFile(filename: string): Promise<ArrayBuffer> {
  const candidates = [
    join(process.cwd(), "assets/fonts", filename),
    join(process.cwd(), "apps/web/assets/fonts", filename),
    join(process.cwd(), "../../apps/web/assets/fonts", filename),
  ];
  for (const path of candidates) {
    try {
      const buf = await readFile(path);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch {
      /* try next */
    }
  }
  throw new Error(`Font file not found: ${filename}`);
}

export async function initPresentationFonts(): Promise<void> {
  if (!regularFont) {
    regularFont = opentype.parse(await resolveFontFile("NotoSans-Regular.ttf"));
  }
  if (!boldFont) {
    boldFont = opentype.parse(await resolveFontFile("NotoSans-Bold.ttf"));
  }
}

function pickFont(bold?: boolean): opentype.Font {
  if (!regularFont || !boldFont) {
    throw new Error("Presentation fonts not initialized");
  }
  return bold ? boldFont : regularFont;
}

function glyphAdvance(font: opentype.Font, ch: string, fontSize: number): number {
  const glyph = font.charToGlyph(ch);
  return (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
}

function measureWidth(text: string, fontSize: number, bold?: boolean, letterSpacing = 0): number {
  const font = pickFont(bold);
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += glyphAdvance(font, text[i]!, fontSize);
    if (i < text.length - 1) width += letterSpacing;
  }
  return width;
}

function anchorX(
  x: number,
  text: string,
  fontSize: number,
  anchor: "start" | "middle" | "end" = "start",
  bold?: boolean,
  letterSpacing = 0,
): number {
  const width = measureWidth(text, fontSize, bold, letterSpacing);
  if (anchor === "end") return x - width;
  if (anchor === "middle") return x - width / 2;
  return x;
}

function renderGlyphs(input: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  bold?: boolean;
  opacity?: number;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
}): string {
  const font = pickFont(input.bold);
  const ls = input.letterSpacing ?? 0;
  let x = anchorX(input.x, input.text, input.fontSize, input.anchor ?? "start", input.bold, ls);
  const opacityAttr =
    input.opacity != null && input.opacity < 1 ? ` fill-opacity="${input.opacity}"` : "";

  let paths = "";
  for (const ch of input.text) {
    const glyph = font.charToGlyph(ch);
    const glyphPath = glyph.getPath(x, input.y, input.fontSize);
    paths += `<path d="${glyphPath.toPathData(2)}" fill="${input.fill}"${opacityAttr}/>`;
    x += glyphAdvance(font, ch, input.fontSize) + ls;
  }
  return paths;
}

/** Single-line text as SVG paths — librsvg/sharp cannot load @font-face. */
export function textPath(input: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  bold?: boolean;
  opacity?: number;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
}): string {
  return renderGlyphs(input);
}

export function wrapTextLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}
