import type { LogoPlacement } from './mockup-layout';
import { computeSceneTablePositions } from './mockup-layout';
import { detectLogoSurface } from './logo-surface.util';
import type { ProductLogoPlacement } from './logo-overlay';

/** Точка логотипа на силуэте товара (доли 0–1 от ячейки) */
export function logoAnchorForProductName(name: string): { cx: number; cy: number; maxScale: number } {
  const n = name.toLowerCase();
  if (n.includes('кепк') || n.includes('бини') || n.includes('шапк')) {
    return { cx: 0.5, cy: 0.42, maxScale: 0.16 };
  }
  if (
    n.includes('блокнот') ||
    n.includes('блок для') ||
    n.includes('graphite') ||
    n.includes('графит') ||
    (n.includes('набор') && (n.includes('блокн') || n.includes('ручк')))
  ) {
    return { cx: 0.5, cy: 0.46, maxScale: 0.18 };
  }
  if (n.includes('носок')) return { cx: 0.5, cy: 0.34, maxScale: 0.12 };
  if (n.includes('шарф')) return { cx: 0.5, cy: 0.44, maxScale: 0.14 };
  if (
    n.includes('поло') ||
    n.includes('футбол') ||
    n.includes('худи') ||
    n.includes('свитшот')
  ) {
    return { cx: 0.38, cy: 0.36, maxScale: 0.14 };
  }
  if (n.includes('ручк') || n.includes('карандаш')) return { cx: 0.5, cy: 0.45, maxScale: 0.095 };
  if (n.includes('кружк') || n.includes('стакан') || n.includes('термокруж')) {
    return { cx: 0.5, cy: 0.44, maxScale: 0.14 };
  }
  if (n.includes('мешок') || n.includes('шоппер') || n.includes('сумк') || n.includes('рюкзак')) {
    return { cx: 0.5, cy: 0.46, maxScale: 0.14 };
  }
  if (n.includes('коробк') || n.includes('gift box') || n.includes('упаковк')) {
    return { cx: 0.5, cy: 0.38, maxScale: 0.2 };
  }
  if (n.includes('свеч') || n.includes('candle')) {
    return { cx: 0.5, cy: 0.55, maxScale: 0.12 };
  }
  if (n.includes('табличк') || n.includes('plaque') || n.includes('деревян')) {
    return { cx: 0.5, cy: 0.48, maxScale: 0.16 };
  }
  if (n.includes('брелок')) return { cx: 0.5, cy: 0.5, maxScale: 0.1 };
  if (n.includes('powerbank') || n.includes('power bank') || n.includes('зарядк')) {
    return { cx: 0.5, cy: 0.48, maxScale: 0.13 };
  }
  return { cx: 0.5, cy: 0.44, maxScale: 0.14 };
}

/** Якорь товара в lifestyle-сцене (доли 0–1 от всего кадра) */
function lifestyleSceneAnchor(productName: string, index: number, total: number): { cx: number; cy: number } {
  const n = productName.toLowerCase();

  if (
    n.includes('кружк') ||
    n.includes('стакан') ||
    n.includes('термокруж') ||
    n.includes('термос') ||
    n.includes('бутылк')
  ) {
    return { cx: 0.5, cy: 0.52 };
  }

  if (
    n.includes('блокнот') ||
    n.includes('ежедневник') ||
    n.includes('graphite') ||
    n.includes('графит') ||
    (n.includes('набор') && (n.includes('блокн') || n.includes('ручк')))
  ) {
    return { cx: 0.48, cy: 0.58 };
  }

  if (n.includes('ручк') || n.includes('карандаш')) {
    const writingSlot = [0.24, 0.76, 0.34, 0.66][index % 4] ?? (index % 2 ? 0.76 : 0.24);
    return { cx: writingSlot, cy: 0.56 };
  }

  if (n.includes('визитниц') || n.includes('картхолдер') || n.includes('card holder')) {
    return { cx: 0.62, cy: 0.56 };
  }

  if (
    n.includes('подставк') ||
    n.includes('держатель') ||
    n.includes('органайзер') ||
    n.includes('stand')
  ) {
    return { cx: 0.74, cy: 0.54 };
  }

  if (n.includes('стикер') || n.includes('стикеры') || n.includes('post-it') || n.includes('запис')) {
    return { cx: 0.4, cy: 0.58 };
  }

  if (n.includes('коробк') || n.includes('gift') || n.includes('упаковк')) {
    return { cx: 0.28, cy: 0.48 };
  }

  if (n.includes('свеч') || n.includes('candle')) {
    return { cx: 0.72, cy: 0.5 };
  }

  if (n.includes('табличк') || n.includes('plaque') || n.includes('деревян')) {
    return { cx: 0.5, cy: 0.68 };
  }

  if (n.includes('звезд') || n.includes('star')) {
    return { cx: 0.44, cy: 0.55 };
  }

  if (
    n.includes('футбол') ||
    n.includes('поло') ||
    n.includes('худи') ||
    n.includes('сумк') ||
    n.includes('шоппер') ||
    n.includes('рюкзак')
  ) {
    return { cx: 0.5, cy: 0.5 };
  }

  const t = total <= 1 ? 0.5 : index / Math.max(1, total - 1);
  return { cx: 0.24 + t * 0.52, cy: 0.55 };
}

/** Позиции логотипа для lifestyle AI-сцены (стол, офис, outdoor) */
export function getLogoPlacementsForLifestyleScene(
  productNames: string[],
): ProductLogoPlacement[] {
  if (productNames.length === 0) return [];
  const total = productNames.length;
  const placements: ProductLogoPlacement[] = productNames.map((name, i) => {
    const scene = lifestyleSceneAnchor(name, i, total);
    const anchor = logoAnchorForProductName(name);
    return {
      centerX: scene.cx,
      centerY: scene.cy,
      scale: Math.min(0.09, anchor.maxScale * 0.5),
      productName: name,
      surface: detectLogoSurface(name),
    };
  });

  // Простой анти-оверлап: слегка разводим логотипы, если они попали слишком близко.
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const dx = placements[j].centerX - placements[i].centerX;
      const dy = placements[j].centerY - placements[i].centerY;
      if (Math.abs(dx) < 0.14 && Math.abs(dy) < 0.12) {
        const shift = dx >= 0 ? 0.07 : -0.07;
        placements[j].centerX = Math.max(0.14, Math.min(0.86, placements[j].centerX + shift));
      }
    }
  }

  return placements;
}

/** Позиции логотипа по раскладке flat-lay / grid и типу каждого товара */
export function getLogoPlacementsForProducts(
  productNames: string[],
  width = 1024,
  height = 1024,
): ProductLogoPlacement[] {
  if (productNames.length === 0) return [];
  const cells = computeSceneTablePositions(productNames.length, width, height);
  return productNames.map((name, i) => {
    const cell = cells[i];
    const anchor = logoAnchorForProductName(name);
    return {
      centerX: (cell.x + cell.size * anchor.cx) / width,
      centerY: (cell.y + cell.size * anchor.cy) / height,
      scale: Math.min(0.16, (cell.size * anchor.maxScale) / width),
      productName: name,
      surface: detectLogoSurface(name),
    };
  });
}
