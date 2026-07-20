import sharp from "sharp";
import type { PresentationIconKey } from "@/lib/brand-palette";

const ICON_PATHS: Record<PresentationIconKey, string> = {
  gift: `<path d="M12 8v13M12 8a4 4 0 0 0 4-4 3 3 0 0 1 3 3 4 4 0 0 0-4 4H8a4 4 0 0 0-4-4 3 3 0 0 1 3-3 4 4 0 0 0 4 4z" stroke="ACCENT" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  shield: `<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" stroke="ACCENT" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`,
  team: `<circle cx="9" cy="8" r="3" stroke="ACCENT" stroke-width="1.6" fill="none"/><circle cx="17" cy="10" r="2.5" stroke="ACCENT" stroke-width="1.6" fill="none"/><path d="M4 19c0-3 2.5-5 5-5s5 2 5 5M14 19c0-2 1.5-4 3.5-4" stroke="ACCENT" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  star: `<path d="M12 3l2.4 5.8L21 10l-4.5 4 1.2 6.2L12 17.5 6.3 20.2 7.5 14 3 10l6.6-1.2L12 3z" stroke="ACCENT" stroke-width="1.6" fill="none" stroke-linejoin="round"/>`,
  leaf: `<path d="M6 20c6-1 10-5 12-12-7 2-11 6-12 12z" stroke="ACCENT" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M9 15c2-2 4-3 6-4" stroke="ACCENT" stroke-width="1.4" fill="none"/>`,
  laptop: `<rect x="4" y="6" width="16" height="11" rx="1.5" stroke="ACCENT" stroke-width="1.6" fill="none"/><path d="M2 19h20" stroke="ACCENT" stroke-width="1.6" stroke-linecap="round"/>`,
  magnet: `<path d="M6 15V9a6 6 0 0 1 12 0v6" stroke="ACCENT" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M6 11H3v4a3 3 0 0 0 3 3h0M18 11h3v4a3 3 0 0 1-3 3h0" stroke="ACCENT" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  thermo: `<rect x="8" y="3" width="8" height="14" rx="4" stroke="ACCENT" stroke-width="1.6" fill="none"/><path d="M12 7v6" stroke="ACCENT" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="16" r="1.2" fill="ACCENT"/>`,
  spark: `<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" stroke="ACCENT" stroke-width="1.6" stroke-linecap="round"/>`,
  heart: `<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z" stroke="ACCENT" stroke-width="1.6" fill="none" stroke-linejoin="round"/>`,
};

const iconCache = new Map<string, string>();

function iconSvg(key: PresentationIconKey, accentHex: string): string {
  const accent = `#${accentHex.replace("#", "")}`;
  const inner = (ICON_PATHS[key] ?? ICON_PATHS.star).replaceAll("ACCENT", accent);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill="#0E1524" stroke="${accent}" stroke-width="0.8" opacity="0.95"/>
    ${inner}
  </svg>`;
}

export async function getIconDataUrl(
  key: PresentationIconKey | undefined,
  accentHex: string,
): Promise<string> {
  const iconKey = key ?? "star";
  const cacheKey = `${iconKey}:${accentHex}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const png = await sharp(Buffer.from(iconSvg(iconKey, accentHex)))
    .resize(96, 96)
    .png()
    .toBuffer();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  iconCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export const DEFAULT_PRODUCT_ICONS: PresentationIconKey[] = [
  "gift",
  "shield",
  "team",
  "star",
];
