import puppeteer, { type Browser } from "puppeteer-core";
import { PDFDocument } from "pdf-lib";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { renderSingleSlideHtml, SLIDE_PAGE_W, SLIDE_PAGE_H } from "./html-deck";
import type { GeneratedSlide, PresentationTheme } from "../types";

function findCachedChrome(): string | undefined {
  const cacheRoot = "/root/.cache/puppeteer/chrome";
  try {
    const versions = readdirSync(cacheRoot);
    for (const version of versions) {
      const candidate = join(cacheRoot, version, "chrome-linux64", "chrome");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    /* cache dir not present */
  }
  return undefined;
}

function resolveChromePath(): string | undefined {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  return findCachedChrome();
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = resolveChromePath();
  if (!executablePath) {
    throw new Error("Chromium executable not found for PDF export");
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

/**
 * Renders each slide as its own fixed-size PDF page (same markup/CSS as the HTML
 * Preview, pinned to a fixed viewport so layout never depends on the caller's
 * window size) and merges them into a single paginated PDF — one slide per page,
 * pixel-identical to what "HTML Preview" shows.
 */
export async function renderSlidesToPdf(
  slides: GeneratedSlide[],
  theme: PresentationTheme,
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SLIDE_PAGE_W, height: SLIDE_PAGE_H });

    const pageBuffers: Buffer[] = [];
    for (const slide of slides) {
      const html = renderSingleSlideHtml(slide, theme);
      await page.setContent(html, { waitUntil: "load", timeout: 60000 });
      const pdf = await page.pdf({
        printBackground: true,
        width: `${SLIDE_PAGE_W}px`,
        height: `${SLIDE_PAGE_H}px`,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      pageBuffers.push(Buffer.from(pdf));
    }

    const merged = await PDFDocument.create();
    for (const buf of pageBuffers) {
      const doc = await PDFDocument.load(buf);
      const copied = await merged.copyPages(doc, doc.getPageIndices());
      copied.forEach((p) => merged.addPage(p));
    }
    return Buffer.from(await merged.save());
  } finally {
    await browser.close();
  }
}
